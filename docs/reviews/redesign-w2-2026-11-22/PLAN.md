# PLAN — Đợt 2 thiết kế lại: sổ máy, việc thu máy, khóa theo máy, phân việc IT theo phòng (bản 2, 23/11/2026)

Spec: [SPEC.md](SPEC.md) bản 2. Trạng thái: Proposed — chờ Owner duyệt bản 2. Đã áp [REVIEW-SPEC.md](REVIEW-SPEC.md),
[OWNER-ANSWERS.md](OWNER-ANSWERS.md) (W2-Q1 = làm ngay, W2-Q2 = báo lỗi sang đợt 7, W2-Q3 → W2-Q5, RC-9, Q7 → Q9, W2-Q6 → W2-Q10) và QĐ-118 (`QĐ-118a` → `QĐ-118o`); REVIEW-SPEC-2 (S2-1 → S2-17, SPEC §13.4). Không còn câu mở (SPEC §14 _Đã chốt_).

- **Nền:** `origin/dev` `4e029dbd` (đợt 1 đã squash vào `dev`). Hai làn tách từ `origin/dev` **mới nhất** sau khi coordinator
  đưa thư mục `docs/reviews/redesign-w2-2026-11-22/` lên `dev`.
- **Nhánh gộp:** `int/redesign-w2` (Owner tạo từ `dev`). Không làn nào merge vào `dev`.
- **Hai làn** (quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md)):
  - **Làn `tech` (Bảo)** — nhánh của Bảo `feat/redesign-w2-tech` (tách từ `origin/dev`): **pha 1** T1 → T2 → T3 → T3b → T4 → T5;
    **pha 2** (sau khi làn `biz` báo B9 xong trên `int/redesign-w2`) `git merge origin/int/redesign-w2` rồi T6 → T7.
  - **Làn `biz` (Owner)** — làm **thẳng trên `int/redesign-w2`** (S2-13, cùng CODE-PROMPT §2): **pha A** B0 (chỉ policy thuần);
    **pha B1** (sau khi Owner merge **T1** vào `int/redesign-w2`) B10a → B10b → B10c → B10d → B10e → B10f → B10g → B11 (luật QĐ-118,
    không file/bảng nào của T2–T5); **pha B2** (sau khi Owner merge **cả pha 1** T2 → T5) B1 → B2a-1 → B2a-2 → B2b → B3a-1 → B3a-2 →
    B3b → B4 → B5a → B5b → B5c → B6 → B7 → B8 → B10h → B9.
  - Mỗi làn một chat Sonnet/Gemini, làm **tuần tự** từng gói, không song song, không worktree.
- **Không sửa chung file.** Danh sách file của mỗi gói dưới đây là danh sách được phép sửa.
  - `prisma/models/*`, `prisma/migrations/*`, `test/gates/architecture-boundaries.gate-spec.ts` — chỉ T1, **trừ** migration 4
    `20261124100400_saas_issue_awaiting_assignee` + model `SaasIssue` (W2-Q10): thuộc **B10c** (biz). Không chạy song song với T1:
    B10c ở pha B1, sau khi T1 đã merge; nullable của cột kéo theo sửa code `saas-issue` của chính B10c.
  - `src/modules/devices/devices.module.ts` — **chỉ làn `biz`** (S-29: đăng ký provider của T2/T5 chuyển vào B1; làn `tech` viết
    provider nhưng không đăng ký, ghi _Bàn giao_). Không còn file đổi chủ theo pha.
  - `src/modules/catalog/public/catalog.api.ts` — chỉ T3 (gồm `installLimitOf` cho T4).
  - `src/cli/seed/**` — chỉ `tech` (T6). Spec seed đỏ trên `int/redesign-w2` vì body `POST /devices` đổi là dự kiến ⟹ ghi
    `FIX-TEST-biz.md` "chờ T6".
  - File chung chỉ **gộp tay** khi merge: `openapi.json` (lấy bản bất kỳ rồi `pnpm openapi:export`),
    `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-*.ts`,
    `test/support/openapi-example-messages-*.ts`, `test/support/api-coverage-manifest.ts`.
  - Module card (`src/modules/*/README.md`) và `docs/rules/*` — chỉ B9 (`biz`). Gói `tech` ghi nội dung card cần thêm vào mục
    _Bàn giao cho làn biz_ của `PROGRESS-tech.md`.
- **Commit:** mỗi gói một commit (hoặc vài commit nhỏ cùng gói), **git identity của chính người làm** (Bảo dùng email GitHub của
  Bảo), không co-author/attribution. Message: `feat(<module>): <tóm tắt> (redesign W2 <gói>)` + thân liệt kê W2-xx. Push nhánh
  làn được (làn `biz` push `int/redesign-w2`); không merge vào `dev`/`main`, không deploy.
- **Tracker:** `PROGRESS-tech.md` / `PROGRESS-biz.md`, `FIX-TEST-<làn>.md`, `OVERNIGHT-DECISIONS-<làn>.md` cùng thư mục — mỗi làn
  chỉ ghi file của mình.

## Bộ kiểm nhanh (mỗi gói)

```text
pnpm typecheck
pnpm lint                 # chậm thì: pnpm exec eslint <file đã sửa…>
pnpm arch:check
pnpm arch:capabilities --module <module đã chạm>   # không vòng capability
pnpm rules:check          # + pnpm rules:format khi sửa docs/rules hoặc README module
pnpm test:gates
pnpm openapi:export       # rồi git diff --stat openapi.json; đổi có chủ đích thì commit cùng gói
pnpm test -- <các file *.spec.ts đã chạm/thêm>
```

- Gói sửa `prisma/` (chỉ T1) thêm `pnpm prisma:validate` và `pnpm prisma:generate`.
- Không chạy `pnpm check`, `test:http`, `test:integration`, `test:e2e`, seed, Docker, migration ở máy. Test http/integration mới
  **viết** trong gói, CI GitHub chạy (chạy tay).
- Luật mới: unit test đỏ trước, chạy thấy đỏ, rồi code cho xanh.
- Test cũ hỏng vì khẳng định hành vi cũ mà không chạy được ở máy ⟹ `FIX-TEST-<làn>.md` (gói · file · ca · lý do).
- **Trần:** 500 dòng code mỗi file `src`, 25 file mỗi thư mục (kể cả spec), 400 dòng mỗi spec unit, 800 dòng mỗi spec
  http/integration. Thư mục đúng trần: `personnel/offboarding/`, `personnel/transfer-grace/` (không thêm file). Vượt thì tách theo
  chức năng, không suppression.
- **Cỡ gói:** ≤ khoảng 12 file sửa/thêm mỗi gói (S-15). Gói vượt khi code ⟹ tách tiếp, ghi `OVERNIGHT-DECISIONS`.

## Gói

| #     | Gói                                                                                  | Mục                                      | Cỡ  | Phụ thuộc                     | Làn  |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------------- | --- | ----------------------------- | ---- |
| T1    | Schema + **bốn** migration (0 → 3)                                                   | W2-01                                    | M   | —                             | tech |
| T2    | Mã tài sản `LOẠI-NĂM-SỐ`                                                             | W2-02                                    | S   | T1                            | tech |
| T3    | Kiểu gắn của gói + lọc _Xin phần mềm_ + `installLimitOf` (catalog)                   | W2-17, W2-18 (catalog), S-22             | S   | T1                            | tech |
| T3b   | Chỉ Super Admin đổi IT phụ trách thuê bao (route riêng); bỏ tự nhận ứng dụng         | W2-27 H16, H14 (Owner Q7, Q8)            | S   | T3                            | tech |
| T4    | Khóa: trần lượt, lượt đã dùng, tồn theo license, pha khởi tạo                        | W2-21                                    | M   | T1, T3                        | tech |
| T5    | Sửa thuộc tính máy                                                                   | W2-04                                    | S   | T1                            | tech |
| B0    | Policy thuần (pha A)                                                                 | luật của W2-05 → W2-14, W2-19, W2-27     | S   | —                             | biz  |
| B1    | Nhập máy, danh sách, chi tiết, _Chờ thu_, `signatureMissing`; đăng ký provider T2/T5 | W2-03, W2-05, H17                        | M   | pha 1 tech, B0, B10a (pha B1) | biz  |
| B2a-1 | Giao/đổi người giữ, thu về kho                                                       | W2-06, W2-08                             | M   | B1                            | biz  |
| B2a-2 | Tình trạng máy; dời ngừng dùng sang `lifecycle` (hành vi cũ)                         | W2-09                                    | S   | B2a-1                         | biz  |
| B2b   | Cờ _có cài collector_ (chỉ bật)                                                      | W2-07                                    | M   | B2a-2                         | biz  |
| B3a-1 | `licensing/device-activation`: repo, service, facade, U (không route)                | W2-19 (licensing, `SeatOccupancyReader`) | M   | T4                            | biz  |
| B3a-2 | Route kích hoạt ở devices, ánh xạ lỗi, I                                             | W2-19 (devices), W2-03 (b), H17          | M   | B3a-1, B2b                    | biz  |
| B3b   | Gỡ, chuyển, danh sách kích hoạt, khóa bị rút                                         | W2-20, W2-22, H17                        | M   | B3a-2                         | biz  |
| B4    | Thay máy, ngừng dùng có loại, hủy bản ghi                                            | W2-10, W2-11, W2-12                      | M   | B3b                           | biz  |
| B10a  | Bộ giải người làm + chỉ định làm thay (organization) + phạm vi IT + `itAdminLoad`    | W2-27 (a), H1, W2-Q7                     | M   | T1, B0                        | biz  |
| B5a   | Việc thu máy: repo, sinh/đổi hạn/hủy, listener `personnel`, U                        | W2-14 (sinh, đổi hạn, hủy), E4           | M   | B4, B10a                      | biz  |
| B5b   | Việc thu máy: danh sách, hoàn tất, nối `DeviceReceiptService`, dashboard             | W2-14 (danh sách, hoàn tất), W2-15, S-11 | M   | B5a                           | biz  |
| B5c   | Việc thu máy: sweeper quá hạn, thông báo chờ/quá hạn                                 | W2-14 (quá hạn, chờ), W2-26 (mã)         | S   | B5b                           | biz  |
| B6    | `MF-1` chặn gói gắn máy (requests) + grant 409                                       | W2-18 (requests, S-4 grant)              | S   | T3                            | biz  |
| B7    | Nhập hiện trạng + bước checklist khởi tạo                                            | W2-13                                    | M   | B3a-2, T2, T4                 | biz  |
| B8    | Phần mềm trên màn máy, _Phần mềm của tôi_                                            | W2-23                                    | S   | B3b                           | biz  |
| B10b  | Provisioning: bỏ hàng `GENERAL`, chỉ người làm của phòng, tự cấp                     | W2-27 H2–H4                              | M   | B10a                          | biz  |
| B10c  | Gia hạn, báo lỗi, đẩy sớm ghost seat theo QĐ-118                                     | W2-27 H5–H7                              | M   | B10a                          | biz  |
| B10d  | `ItCoverageSweeper` + thông báo chỉ định                                             | W2-27 (c), W2-26 (mã)                    | S   | B10a                          | biz  |
| B10e  | QĐ-118 cho báo lỗi SaaS, đánh giá Request case B, quyết ghost seat phía IT           | W2-27 H9–H11 (Owner Q8)                  | M   | B10a                          | biz  |
| B10f  | QĐ-118 cho bước hồ sơ nghỉ việc, dừng thu thập                                       | W2-27 H12, H13 (Owner Q8)                | S   | B10a                          | biz  |
| B10g  | Người nhận thông báo theo QĐ-118 (tám notifier + nhắc gia hạn)                       | W2-27 H15 (Owner Q8)                     | M   | B10a, B10c                    | biz  |
| B10h  | Việc của người chưa xếp phòng: chỉ định theo việc, bộ giải, bốn chỗ gọi, thông báo   | W2-27 (e) (W2-Q8)                        | M   | B10b, B10f, B5c, B10d         | biz  |
| B11   | RC-9: mở lại thu hồi điều chuyển                                                     | W2-28                                    | S   | B10a                          | biz  |
| B9    | Chốt làn `biz`: tài liệu, module card, sinh lại, `FIX-TEST`                          | W2-26 (tài liệu)                         | S   | B1 → B11                      | biz  |
| T6    | Seed theo luật mới                                                                   | W2-25                                    | M   | B9 trên `int/redesign-w2`     | tech |
| T7    | Chốt làn `tech`: `FIX-TEST`, sinh lại                                                | —                                        | S   | T6                            | tech |

- **Migration:** năm thư mục (SPEC §3); 0 → 3 ở T1, 4 ở B10c: `20261124100000_device_registration_end_cause_returned`,
  `20261124100100_devices_register_lifecycle`, `20261124100200_device_activations`, `20261124100300_department_it_substitutes`
  (gồm cả bảng `unplaced_work_it_designations`, W2-Q8), `20261124100400_saas_issue_awaiting_assignee` (W2-Q10).
- **Gỡ so với bản 1:** B8b (báo lỗi quyền gắn máy, W2-24) — dời đợt 7 (W2-Q2); migration `saas_issue_device_activation` bỏ.
- **B10a làm đầu pha B1** (bộ giải `itAdminsActingFor(departmentIds, usableAmong, tx?)`, phạm vi đọc/làm, phòng của việc — cần
  cho B1 và mọi gói QĐ-118). B6 độc lập với B1 → B4.
- **W2-Q6 (H17) làm ngay trong gói sở hữu route:** B1 (`deviceCreate` có người giữ), B2a-1 (đổi người giữ, thu về), B2a-2 (tình
  trạng, ngừng dùng), B2b (bật collector), B3a-2 (kích hoạt), B3b (gỡ, chuyển), B4 (thay máy, ngừng dùng), B7 (nhập hiện trạng có người giữ); B0 thêm `judgeDeviceActor`.
- Owner đã trả lời Q7 (chỉ Super Admin đổi IT phụ trách thuê bao — T3b), Q8 (QĐ-118 cho mọi route/thông báo còn lại — B10e,
  B10f, B10g, T3b phần ứng dụng), Q9 (giữ `QĐ-77m`, tự cấp không chặn — B10b), W2-Q7 (làm thay không tính trần 4 phòng, cảnh báo
  — B10a), W2-Q8 (việc của người chưa xếp phòng do Super Admin chỉ định theo việc — T1 bảng, B10h), W2-Q9 (cờ _làm thay theo chỉ
  định_ chỉ Audit Trail, không thêm báo cáo — mọi gói QĐ-118).

---

### T1 — Schema và bốn migration (M, `tech`)

- **File:** `prisma/models/devices.prisma`, `licensing.prisma`, `catalog.prisma`, `organization.prisma`; bốn thư mục
  `prisma/migrations/2026112410xxxx_*/migration.sql` (tên, thứ tự: SPEC §3); `test/gates/architecture-boundaries.gate-spec.ts`
  (`PRISMA_MODEL_OWNER`, `:32-207`); I mới `test/integration/devices/devices-register-schema.integration-spec.ts`,
  `test/integration/licensing/device-activation-constraints.integration-spec.ts`,
  `test/integration/organization/department-it-substitute-constraints.integration-spec.ts`.
- **Làm:** đúng SPEC §3.1 → §3.4. Migration 0 **chỉ** `ALTER TYPE "DeviceRegistrationEndCause" ADD VALUE 'RETURNED'`. Trigger dùng
  `CREATE OR REPLACE` trên **bản mới nhất** của hàm (đường dẫn ở SPEC). `license_key_guard` thêm nhánh S-4;
  `plans_keep_children_valid` thêm ba lý do mới (S-5). Migration 3 tạo thêm `unplaced_work_it_designations` + hai enum (SPEC §3.3,
  W2-Q8); `PRISMA_MODEL_OWNER` thêm `UnplacedWorkItDesignation`. Khởi tạo bộ đếm dùng `upper(btrim(asset_code))` (S-30). Không thêm dòng vào
  `scripts/verify/merged-migrations.txt`.
- **Kiểm:** bộ nhanh + `pnpm prisma:validate` + `pnpm prisma:generate`. Code TypeScript có sẵn phải vẫn typecheck (cột mới đều
  có mặc định hoặc nullable).
- **REVIEW-SPEC-2:** migration 3 thêm `DEPARTMENT_RETIRED`, `WORK_CLOSED` và hai index một phần (S2-11, S2-8, S2-17).
  Migration 4 (`saas_issue_awaiting_assignee`) **không** ở T1: thuộc B10c (xem ngoại lệ đầu PLAN).
- **Xong khi:** W2-01 (a) → (h) có test I; gate `architecture-boundaries`, `migration-order` xanh; message commit ghi "migration 0
  `ALTER TYPE … ADD VALUE` không hoàn tác" và hai backfill (`device_type = 'OTH'`, `retirement_kind = 'DISPOSED'`).

### T2 — Mã tài sản (S, `tech`)

- **File:** mới `src/modules/devices/asset-code/asset-code.policy.ts` (+ `.spec.ts`), `asset-code.repo.ts`,
  `asset-code.service.ts`, `asset-code.errors.ts` (`DeviceAssetCodeExhaustedError`); I mới
  `test/integration/devices/asset-code-counter.integration-spec.ts`.
- **Làm:** SPEC W2-02. Service: `next(tx: DbTx, deviceType, today: BusinessDate): Promise<string>`. Repo theo mẫu
  `licensing/saas-issue/saas-issue.repo.ts:149-163`. Năm = `Number(today.slice(0, 4))`. **Không** sửa `devices.module.ts` (S-29):
  ghi vào _Bàn giao_ "B1 đăng ký `AssetCodeRepo`, `AssetCodeService`; ánh xạ 409 `DEVICE.ASSET_CODE_EXHAUSTED`,
  `DEVICE.ASSET_CODE_TAKEN`". I (c) dựng module test riêng, không cần đăng ký trong `DevicesModule`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/devices/asset-code`.
- **Xong khi:** W2-02 (a) → (d).

### T3 — Kiểu gắn của gói, lọc _Xin phần mềm_, `installLimitOf` (S, `tech`)

- **File:** `src/modules/catalog/plan/plan.dto.ts`, `plan.types.ts`, `plan.policy.ts` (+ spec), `plan.service.ts` (`declare`,
  `update`, `CHANGE_BLOCKS` `:323-330`), `plan.repo.ts`, `plan.mapper.ts`, `plan.errors.ts` (`PlanChangeBlock` `:177`),
  `plan.http-errors.ts`, `plans.controller.ts`; `catalog/subscription/subscription.service.ts` (`assertShape`, gọi `:206`, định nghĩa
  `:311-325`); `catalog/public/catalog.types.ts` (`SeatTarget.keyBinding`), `catalog/public/catalog.api.ts` (+ repo của
  `findPlanSeatTargets`; mới `installLimitOf(planId, tx)` đọc `catalog/plan-terms/plan-terms.repo.ts:16`);
  `catalog/requestable-software/requestable-software.repo.ts` (+ policy spec); I mới
  `test/integration/catalog/plan-key-binding.integration-spec.ts`, `test/integration/catalog/requestable-device-bound.integration-spec.ts`.
- **Làm:** SPEC W2-17, W2-18 phần `tech`. Ba lý do chặn mới `KEY_BINDING_PURCHASES`, `KEY_BINDING_ASSIGNMENTS`,
  `DEVICE_ACTIVATIONS` (không dùng lại `PERPETUAL_SUBSCRIPTIONS`). Lọc gói xin được bằng một hằng `REQUESTABLE_PLAN` dùng chung bốn
  chỗ của `requestable-software.repo.ts` (`:76`, `:104`, `:113-130`, `:151`).
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/catalog/plan src/modules/catalog/requestable-software src/modules/catalog/subscription`.
- **Xong khi:** W2-17 (a) → (d); W2-18 (b).

### T3b — Người phụ trách thuê bao và ứng dụng chỉ Super Admin đổi (S, `tech`)

- **File:** `src/modules/catalog/subscription/subscription.dto.ts` (bỏ `responsibleItAdminEmployeeId` của update, `:70`),
  `subscription.service.ts` (`:74`, `:171` nhánh update), `subscriptions.controller.ts` (mô tả `subscriptionUpdate`) hoặc
  controller mới cùng capability cho `POST /subscriptions/{id}/responsible-it-admin` (`subscriptionResponsibleItAdminChange`,
  `SUPER_ADMIN`), service/errors/http-errors tương ứng (+ spec); `catalog/application-responsibility/application-responsibility.policy.ts`
  (bỏ `mayTake`, + spec), `application-responsibility.controller.ts` (mô tả 403); manifest OpenAPI (gộp tay); I mới
  `test/integration/catalog/subscription-responsible.integration-spec.ts`, sửa I của `application-responsibility`.
- **Làm:** SPEC W2-27 H14, H16 (Owner Q7, Q8). Khóa `subscriptions` FU (tầng 6) trước khi ghi; audit
  `SUBSCRIPTION.RESPONSIBLE_CHANGED`. `subscriptionCreate` giữ trường (W2-D20). Seed nào đổi người phụ trách qua `subscriptionUpdate`
  ⟹ ghi _Bàn giao_ cho T6.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/catalog/subscription src/modules/catalog/application-responsibility`.
- **REVIEW-SPEC-2 (S2-4):** H14 bỏ **cả** `mayTake` lẫn `mayHandOver` của người phụ trách: chỉ Super Admin đổi người phụ trách ứng
  dụng; tiêu chí (v) phần ứng dụng.
- **Xong khi:** W2-27 tiêu chí (l), (n).

### T4 — Khóa: lượt, tồn theo license, pha khởi tạo (M, `tech`)

- **File:** `src/modules/licensing/license-key/license-key.dto.ts`, `license-key.policy.ts` (+ spec), `license-key.service.ts`,
  `license-key.repo.ts`, `license-key.errors.ts`, `license-key.http-errors.ts`, `license-keys.controller.ts`;
  `licensing/seat-baseline/*` (giữ hàng trạng thái qua `SeatBaselineRepo.lock(tx, org, 'SHARE')`, `seat-baseline.repo.ts:34-44`),
  `licensing/public/licensing-seat-baseline.api.ts` (`holdInitializationOpen`); `licensing/stock-summary/stock-summary.policy.ts`
  (+ spec), `stock-summary-query.service.ts`; I mới `test/integration/licensing/license-key-activations.integration-spec.ts`; sửa
  `license-key-http.integration-spec.ts`.
- **Làm:** SPEC W2-21. Số đếm lượt đọc `device_activations` bằng **một** câu `GROUP BY license_key_id` trong `license-key.repo.ts`.
  Hàm đếm _đang chiếm_ dùng hàm SQL `device_activation_occupied` của T1. `capacityOf` nhận `keyBinding`. `maxActivations` mặc định
  qua `CatalogApi.installLimitOf` (T3). `initialActivationsUsed` một giá trị cho cả lần nhập (W2-Q5). `STALE` có
  `details.currentUpdatedAt`. Kiểm `pnpm arch:capabilities --module licensing`: `license-key` → `seat-baseline` không tạo vòng.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/licensing/license-key src/modules/licensing/stock-summary src/modules/licensing/seat-baseline`.
- **Xong khi:** W2-21 (a) → (d).

### T5 — Sửa thuộc tính máy (S, `tech`)

- **File:** mới `src/modules/devices/attributes/` (`device-attributes.controller.ts`, `.dto.ts`, `.service.ts`, `.repo.ts`,
  `.policy.ts` + spec, `.errors.ts`, `.http-errors.ts`); manifest OpenAPI (gộp tay); I mới
  `test/integration/devices/device-attributes.integration-spec.ts`.
- **Làm:** SPEC W2-04. Không route nào của T5 dùng file của `registry/`. **Không** sửa `devices.module.ts` (S-29): controller và
  provider ghi vào _Bàn giao_ cho B1. Vì route chưa đăng ký nên `openapi.json` chưa có `deviceUpdate` ở pha 1: H/I của T5 viết sẵn,
  CI chạy sau B1; ghi `FIX-TEST-tech.md` "chờ B1 đăng ký".
- **Xong khi:** W2-04 (a) → (c) viết xong; unit policy xanh; nội dung card ở _Bàn giao_.

---

### B0 — Policy thuần (S, `biz`, pha A)

- **File (mới):** `src/modules/devices/devices-custody.policy.ts` (+ spec), `devices/lifecycle/lifecycle.policy.ts` (+ spec),
  `devices/return-task/device-return-task.policy.ts` (+ spec), `licensing/device-activation/device-activation.policy.ts` (+ spec),
  `organization/department-it-substitute/department-it-substitute.policy.ts` (+ spec).
- **Làm:** hàm thuần với kiểu đầu vào riêng (không cần Prisma client mới): `custodyOf`, `judgeGive`, `judgeKeyActivationTarget`
  (cả hai kiểu gắn cần `USABLE`, S-8), `judgeVoid` (thứ tự lý do có `AWAITING_RETURN` đầu, S-20), `judgeSoftwareRemoval`;
  `returnDueOn({ accessBlockMode, lastWorkingDay, today })` (S-7), `isOverdue`, `shouldRemindOn({ dueOn, noticedOn, today,
isWorkingDay })` (W2-Q4); `actingItAdmins({ inCharge, inChargeUsable, substitute, substituteUsable, leaverId })` (QĐ-118, loại
  người nghỉ); `judgeAppoint` (lỗi chỉ định W2-27 a); `judgeDeviceActor({ holderDepartmentId, recipientDepartmentId, actingByDepartment, actor })` (W2-Q6, SPEC §4.1); `activationsUsed`, `isOverCap`, `capReached`, `occupied`, `judgeOpen`,
  `judgeDecision`. Mỗi hàm trả mã lý do ngữ nghĩa theo thứ tự xác định (BEH.1). Bảng trạng thái SPEC §4 thành bảng test (`it.each`).
- **Kiểm:** bộ nhanh + `pnpm test -- <năm spec>`.
- **Xong khi:** mọi dòng của SPEC §4.1 → §4.3 có một ca test; chưa có service nào gọi.

### B1 — Nhập máy, danh sách, chi tiết (M, `biz`)

- **File:** `src/modules/devices/registry/registry.dto.ts`, `registry.service.ts` (`create`), `registry.repo.ts`,
  `registry-query.repo.ts`, `registry-query.service.ts`, `registry.mapper.ts`, `registry.errors.ts`, `registry.http-errors.ts`,
  `registry.controller.ts` (chỉ `create`, `list`, `get`, `registrations`); `devices/devices.module.ts` (đăng ký provider/controller
  của T2, T5 theo _Bàn giao_); `test/support/devices-harness.ts`, `test/support/vendor-usage-harness.ts` (body mới); H
  `test/http/devices/devices-routes.http-spec.ts`; I sửa `test/integration/devices/devices-register.integration-spec.ts`,
  `devices-registrations.integration-spec.ts`.
- **Làm:** SPEC W2-03, W2-05 (gồm `signatureMissing`, `currentDepartment` hai lần đọc, `openReturnTask` để `null` tới B5b). Mã qua
  `AssetCodeService.next` (T2); ánh xạ 409 `ASSET_CODE_EXHAUSTED`, `ASSET_CODE_TAKEN`. `bundledPlanIds`: B1 nhận trong DTO nhưng ném
  422 `DEVICE_ACTIVATION.PLAN_NOT_BUNDLED` cho mọi giá trị không rỗng (ghi _OVERNIGHT-DECISIONS_); B3a-2 gỡ.
- **Xong khi:** W2-03 (a), (c) → (e), W2-05 (a) → (d); route `deviceUpdate` của T5 có trong `openapi.json`; `FIX-TEST-biz.md` có
  dòng spec seed "chờ T6".

### B2a-1 — Giao/đổi người giữ, thu về kho (M, `biz`)

- **File:** mới `src/modules/devices/lifecycle/` (`lifecycle.controller.ts`, `lifecycle.dto.ts`, `holder-change.service.ts`,
  `device-receipt.service.ts`, `lifecycle.errors.ts`, `lifecycle.http-errors.ts`, `lifecycle.mapper.ts`); `registry/registry.controller.ts`,
  `registry.service.ts` (bỏ `changeHolder`), `registration-end.service.ts` (`softwareRemoval`); `devices/devices.module.ts`; H; I
  mới `test/integration/devices/devices-lifecycle.integration-spec.ts`.
- **Làm:** SPEC W2-06, W2-08. Route và `operationId` của đổi người giữ giữ nguyên (chỉ đổi controller). `DeviceReceiptService` chưa
  có việc thu máy ở gói này (B5b nối, kèm 403 `NOT_IN_CHARGE`).
- **Xong khi:** W2-06 (a) → (e), W2-08 (a) → (c).

### B2a-2 — Tình trạng máy, dời ngừng dùng (S, `biz`)

- **File:** `devices/lifecycle/` (thêm `condition.service.ts`, `retirement.service.ts` chuyển từ `registry.service.ts:128-145` giữ
  hành vi cũ tới B4; sửa controller, dto, errors, http-errors); `registry/registry.controller.ts`, `registry.service.ts` (bỏ
  `retire`); I thêm ca vào `devices-lifecycle.integration-spec.ts`.
- **Làm:** SPEC W2-09. Route/`operationId` của ngừng dùng giữ nguyên.
- **Xong khi:** W2-09 (a), (b).

### B2b — Cờ _có cài collector_ (M, `biz`)

- **File:** `src/modules/devices/devices-collection-state.policy.ts` (+ spec), `registry/registry-query.repo.ts` (`STATE_SQL`),
  `credential/enrollment/credential-enrollment.service.ts`, `credential/credential.errors.ts`, `credential.http-errors.ts`,
  `credential/credential.controller.ts` (mô tả 409), `acknowledgement/acknowledgement.policy.ts` (+ spec),
  `acknowledgement.service.ts`, `acknowledgement.http-errors.ts`, `acknowledgement.controller.ts`, `my-devices/my-devices.dto.ts`,
  `my-devices.service.ts`; route mới `POST /device-registrations/{id}/collector-installation` trong một controller của `registry/`
  (chọn và ghi _OVERNIGHT-DECISIONS_); I thêm ca vào `devices-acknowledgement.integration-spec.ts`,
  `devices-credential-enrollment.integration-spec.ts`.
- **Làm:** SPEC W2-07 (kiểm `judgeHolder`, chỉ bật). Dashboard IT (`it-admin-dashboard-facts.service.ts:48`) không sửa code. Gói
  ~14 file: vượt 12 thì tách `B2b-1` (trạng thái + phát mã + xác nhận) và `B2b-2` (route bật collector), ghi _OVERNIGHT_.
- **Xong khi:** W2-07 (a) → (e).

### B3a-1 — `licensing/device-activation`: repo, service, facade (M, `biz`)

- **File:** mới `src/modules/licensing/device-activation/` (`device-activation.repo.ts`, `device-activation.service.ts`,
  `device-activation-query.service.ts`, `device-activation.types.ts`, `device-activation.errors.ts`), mới
  `licensing/public/licensing-device-activation.api.ts`, `licensing/licensing.module.ts` (provider + export),
  `licensing/assignment/assignment-seat-occupancy.listener.ts` (`occupiedBySubscription`, `seatsOfSubscriptions`,
  `subscriptionsWithOpenSeats`); `test/gates/module-graph.gate-spec.ts` (`PUBLIC_CONTRACT_EXPORTS`); I mới
  `test/integration/licensing/device-activation.integration-spec.ts` (gọi facade trực tiếp).
- **Làm:** SPEC W2-19 phần licensing + S-6. Ánh xạ lỗi DB (`device_activations_lot_capacity`, `device_activations_one_open`,
  `device_activations_key_usable`) sang lỗi nghiệp vụ trong licensing. Thứ tự khóa: khoản mua (`CatalogApi.lockSeatTarget`) → khóa
  FS → chèn. Không route.
- **Xong khi:** W2-19 (a) (b) (d) (e) (f) ở mức facade; unit xanh.

### B3a-2 — Route kích hoạt ở devices (M, `biz`)

- **File:** mới `src/modules/devices/activation/` (`activation.controller.ts`, `activation.dto.ts`, `activation.service.ts`,
  `activation.http-errors.ts`, `activation.mapper.ts`); `devices/registry/registry.service.ts` (gỡ chặn `bundledPlanIds` của B1);
  `devices/devices.module.ts` (import `LicensingModule`); I mới `test/integration/devices/device-activation-routes.integration-spec.ts`.
- **Làm:** SPEC W2-19 phần devices, W2-03 (b). Thứ tự khóa SPEC §6: máy (devices) → khoản mua → khóa → chèn.
- **Xong khi:** W2-19 (a) → (f), W2-03 (b).

### B3b — Gỡ, chuyển, danh sách, khóa bị rút (M, `biz`)

- **File:** `licensing/device-activation/*`, `licensing/public/licensing-device-activation.api.ts`; `devices/activation/*`; I thêm
  ca vào hai file của B3a, I mới `test/integration/devices/device-activation-list.integration-spec.ts`.
- **Làm:** SPEC W2-20, W2-22. `move` đóng dòng cũ rồi mới chèn (S-12). Chuyển khóa: khóa hai máy trong **một** câu theo `id`
  (`registry.repo.ts` thêm `lockDevices(tx, ids)`).
- **Xong khi:** W2-20 (a) → (f), W2-22 (a) → (c).

### B4 — Thay máy, ngừng dùng có loại, hủy bản ghi (M, `biz`)

- **File:** `devices/lifecycle/*` (thêm `replacement.service.ts`, `void.service.ts`; sửa `retirement.service.ts`, `lifecycle.dto.ts`,
  controller, errors, http-errors), `devices/registry/registry.repo.ts` (`voidDevice`, `retireDevice` có `kind`, đọc lịch sử cho
  hủy bản ghi); I mới `test/integration/devices/device-replacement.integration-spec.ts`, `device-retirement-void.integration-spec.ts`.
- **Làm:** SPEC W2-10, W2-11 (`retirementKind` tùy chọn, mặc định `DISPOSED`), W2-12. Mã máy _Chờ thu_ là `DEVICE.AWAITING_RETURN`
  (chặn thật nối ở B5b khi có bảng việc).
- **Xong khi:** W2-10 (a) → (c), W2-11 (a) → (c), W2-12 (a), (b); test đồng thời _thay máy ‖ chuyển khóa_.

### B10a — Bộ giải người làm, chỉ định làm thay, phạm vi IT (M, `biz`)

- **File:** mới `src/modules/organization/department-it-substitute/` (`department-it-substitute.controller.ts`, `.dto.ts`,
  `.service.ts`, `.repo.ts`, `.errors.ts`, `.http-errors.ts`, `.mapper.ts`; policy đã có từ B0); `organization/department/department.policy.ts`
  (`itAdminScope` `:105`, + spec), `department-record.service.ts` (`itAdminScopeOf` `:185`); `organization/department-management/*`
  (service đổi IT phụ trách đóng chỉ định; mapper `itSubstitute`, `itCoverage`); `organization/public/organization-read.api.ts`
  (`itAdminsActingFor`, `getItAdminScope` `:189`); `organization/organization-http.module.ts`/`organization.module.ts`; I mới
  `test/integration/organization/department-it-substitute.integration-spec.ts`.
- **Làm:** SPEC W2-27 (a) (gồm `itAdminLoad`, W2-Q7: chỉ định không kiểm trần, trả cảnh báo; `departmentUpdate` cũng trả) và H1. Thông báo chỉ định để B10d (mã thông báo cần route đích). Kiểm `pnpm arch:capabilities --module
organization`. Mọi I/flow khẳng định "phòng không IT ⟹ mọi IT thấy" ⟹ FIX-TEST (không chạy được ở máy).
- **REVIEW-SPEC-2:** chữ ký `itAdminsActingFor(departmentIds, usableAmong, tx?)`, `itAdminsActingForUnplacedWork(works,
usableAmong, tx?)`, `getItAdminActingScope(employeeId, usableAmong, tx?)` — bên gọi truyền
  `ids => identity.findUsableItAdminEmployeeIds(ids, tx)`, **không** qua hook (S2-3). `getItAdminScope` (đọc) **giữ luật cũ** + phòng
  làm thay; `getItAdminActingScope` mới cho route ghi/hàng việc (S2-2). Facade `workDepartmentsOf`,
  `getEmployeeIdsOfWorkDepartments` (phòng hôm nay, không có thì lần cuối — S2-1). Chỉ định khóa employee người được chỉ định → phòng
  (S2-9) + I đồng thời; 422 `NOT_USABLE_IT_ADMIN` (S2-14); gỡ IT phụ trách không đóng chỉ định, `departmentDeactivate` đóng
  `DEPARTMENT_RETIRED` (S2-11). Thêm vào file: `organization/department/department-record.service.ts` (phạm vi làm),
  `organization/employee/*` repo đọc lần xếp cuối theo lô. Tiêu chí thêm (s) phần phòng của việc, (t), (u), (w).
- **Xong khi:** W2-27 tiêu chí (a) → (c), (p).

### B5a — Việc thu máy: sinh, đổi hạn, hủy (M, `biz`)

- **File:** mới `src/modules/devices/return-task/` (`device-return-task.repo.ts`, `device-return-task.service.ts` — sinh/đổi
  hạn/hủy, `device-return-task.types.ts`, `device-return-task.errors.ts`); `devices/public/devices.api.ts`, `devices.types.ts`;
  `devices/devices.module.ts`; `src/modules/personnel/offboarding/device-registration.listener.ts` (thêm `onRecorded`,
  `onDueChanged`, mở rộng `onCancelled`; inject `OffboardingRepo`); I mới
  `test/integration/personnel/departure-device-return.integration-spec.ts`.
- **Làm:** SPEC W2-14 (sinh, đổi hạn, hủy). Hai hook đọc lại hồ sơ, không dùng `event.dueOn` (S-7). Đường hủy là ngoại lệ E4: comment
  thứ tự khóa trong listener và service. Kiểm gate `extension-wiring` (listener có sẵn, không thêm extension point).
- **Xong khi:** W2-14 (a), (b), (d), (e), (f phần sinh), (k).

### B5b — Việc thu máy: danh sách, hoàn tất (M, `biz`)

- **File:** `devices/return-task/` (thêm `device-return-task-query.service.ts`, `device-return-task.controller.ts` (GET),
  `device-return-task.dto.ts`, `device-return-task.mapper.ts`, `device-return-task.http-errors.ts`); `devices/lifecycle/` (route
  hoàn tất, `device-receipt.service.ts` nối việc + 403 `NOT_IN_CHARGE`, `retirement.service.ts`/`holder-change.service.ts`/
  `void.service.ts` chặn `AWAITING_RETURN`); `registry-query.repo.ts` (`openReturnTask`, `custody` đọc bảng việc);
  `devices/public/devices.api.ts` (`countReturnTasks`); `dashboards/it-admin/it-admin-dashboard-facts.service.ts` (+ dto/mapper hai
  số); I mới `test/integration/devices/device-return-task.integration-spec.ts`, `test/integration/devices/devices-transfer-unchanged.integration-spec.ts`.
- **Làm:** SPEC W2-14 (danh sách, hoàn tất, dashboard), W2-15. Người làm việc qua `OrganizationReadApi.itAdminsActingFor` (B10a).
- **Xong khi:** W2-14 (c), (f), (g), (h), (j); W2-15.

### B5c — Việc thu máy: quá hạn và chờ (S, `biz`)

- **File:** `devices/return-task/` (thêm `device-return-task.job.ts`, `device-return-task-sweep.service.ts`,
  `device-return-task-notifier.service.ts`); `devices/return-task/device-return-task.service.ts` (gọi thông báo chờ lúc sinh);
  `src/modules/notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`,
  `inbox/notification-target.policy.ts`, `inbox/notification-text/notification-texts-ops.types.ts` (+ spec chữ); I thêm ca (i) vào
  `device-return-task.integration-spec.ts`.
- **Làm:** SPEC W2-14 (quá hạn mỗi ngày làm việc, thông báo chờ cho Super Admin), W2-26 hai mã `DEVICE_RETURN_OVERDUE`,
  `DEVICE_RETURN_WAITING`. `pnpm test -- src/modules/notifications`.
- **Xong khi:** W2-14 (c phần thông báo), (i); flow `test/flows/mf2-*.flow-spec.ts` còn đỏ thì ghi FIX-TEST.

### B6 — `MF-1` chặn gói gắn máy (S, `biz`)

- **File:** `src/modules/requests/access-request/access-request.errors.ts`, `access-request.http-errors.ts`,
  `request-facts.service.ts` (+ spec), `catalog-link/catalog-link.service.ts`, `draft/request-draft.service.ts`, các
  `*.http-errors.ts` + controller có `PLAN_NOT_FOUND` của nhóm route ở SPEC W2-18 (`assessment`, `group-request`, `draft`);
  `licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (ánh xạ `license_key_assignment_plan_account` ⟹ 409
  `PROVISIONING.PLAN_BOUND_TO_DEVICE`) + errors/http-errors của provisioning; I mới
  `test/integration/requests/request-device-bound-plan.integration-spec.ts`.
- **Làm:** SPEC W2-18 phần `biz` và S-4 lớp ứng dụng.
- **Xong khi:** W2-18 (a), (c), (d), (e).

### B7 — Nhập hiện trạng, bước checklist khởi tạo (M, `biz`)

- **File:** mới `src/modules/devices/initial-record/` (controller, dto, service, http-errors); `devices/devices.module.ts`;
  `devices/public/devices.api.ts` (`initialRecordProgress`); `src/modules/onboarding/onboarding.policy.ts` (+ spec),
  `onboarding.service.ts` (+ spec), `onboarding.controller.ts` (mô tả bước); I mới
  `test/integration/devices/device-initial-record.integration-spec.ts`.
- **Làm:** SPEC W2-13. Dùng `registry.service` (tạo máy), `lifecycle` (giao), `LicensingDeviceActivationApi.open` với
  `origin: 'INITIAL'`, `LicensingSeatBaselineApi.holdInitializationOpen` (T4) ở đầu transaction (tầng 0b rồi 0c).
- **Xong khi:** W2-13 (a) → (e).

### B8 — Phần mềm trên màn máy, _Phần mềm của tôi_ (S, `biz`)

- **File:** `src/modules/devices/activation/*` (hai route GET); `devices/my-devices/*` nếu đặt route `me` ở đó (chọn một, ghi
  _OVERNIGHT-DECISIONS_); I mới `test/integration/devices/device-software.integration-spec.ts`.
- **Làm:** SPEC W2-23 (API description ghi chưa báo lỗi được trên dòng gắn máy).
- **Xong khi:** W2-23 (a), (b).

### B10b — Provisioning theo QĐ-118 (M, `biz`)

- **File:** `src/modules/licensing/provisioning/provisioning.policy.ts` (+ spec; `inGeneralQueue` → `awaitingItAdmin`,
  `selfExecution`), `provisioning-task-frame.service.ts` (`work` kiểm người làm), `tasks/provisioning.service.ts`,
  `tasks/provisioning-task.repo.ts` (bỏ `generalQueueOf`), `tasks/provisioning-task-view.service.ts`, `tasks/provisioning.dto.ts`,
  `tasks/provisioning-tasks.controller.ts` (mô tả, `scope`), `revocation-completion/revocation-completion.service.ts`,
  `provisioning.errors.ts`/`provisioning.http-errors.ts` (403 `PROVISIONING.NOT_IN_CHARGE`); I mới
  `test/integration/licensing/provisioning-in-charge.integration-spec.ts`.
- **Làm:** SPEC W2-27 H2–H4 (Owner Q9: IT phụ trách là người thụ hưởng ⟹ tự cấp, cờ _tự thực thi_ + báo Super Admin, **không chặn**; bỏ nhánh 409 `ANOTHER_IT_ADMIN_NEEDED`). Danh sách đọc người làm theo lô phòng (một lần cho cả trang).
- **REVIEW-SPEC-2:** `provisioningTaskList` `MINE` = phạm vi làm, `ALL` = phạm vi đọc (lọc người thụ hưởng qua
  `getEmployeeIdsOfWorkDepartments`), `provisioningTaskGet` ngoài phạm vi đọc ⟹ 404 (S2-10). Phòng của việc theo S2-1. H18 phần
  provisioning: `revocation-task-factory.service.ts:31`, `provisioning-extension.service.ts:35`, `provisioning-grant-planner.service.ts:65`
  chọn `substitute ?? inCharge`. Tiêu chí thêm (s), (x).
- **Xong khi:** W2-27 tiêu chí (d), (e), (j).

### B10c — Gia hạn, báo lỗi, đẩy sớm theo QĐ-118 (M, `biz`)

- **File:** `src/modules/licensing/subscription-renewal/subscription-renewal-parties.service.ts` (+ spec), `record/renewal-record.service.ts`,
  `outcome/renewal-outcome.service.ts`, `subscription-renewal.controller.ts` (mô tả 403); `licensing/saas-issue/saas-issue.service.ts`,
  `saas-issue.policy.ts` (+ spec); `src/modules/optimization/escalation/escalation-facts.service.ts`, `escalation.service.ts` (+
  spec); I sửa `subscription-renewal-record.integration-spec.ts`, `ghost-seat-escalation.integration-spec.ts`.
- **Làm:** SPEC W2-27 H5–H7 (Owner Q7: không làm thay tạm theo thuê bao; nhắc gia hạn không người phụ trách ⟹ Super Admin). Ca W1-12 (b), W1-13 "A bị khóa ⟹ ESCALATED" đổi kỳ vọng.
- **REVIEW-SPEC-2 / Owner W2-Q10 (S2-12):** **migration 4** `prisma/migrations/20261124100400_saas_issue_awaiting_assignee/migration.sql`
  - `prisma/models/licensing.prisma` (chỉ model `SaasIssue`: `assignedItAdminEmployeeId String?`) — ngoại lệ có chủ đích của luật
    "prisma chỉ T1" (đầu PLAN); `pnpm prisma:validate`, `pnpm prisma:generate`. H6: phiếu chờ người tiếp nhận, `SAAS_ISSUE_AWAITING_ASSIGNEE`
    (mã thông báo + bốn file `notifications` như B5c), lượt giao trong `SaasIssueSweeper` (`saas-issue/saas-issue.job.ts`), response
    nullable (phá contract `saasIssueSubmit`/`Get`/`List`). Vượt ~12 file ⟹ tách `B10c-1` (gia hạn, đẩy sớm) / `B10c-2` (báo lỗi +
    migration 4). Tiêu chí thêm (y).
- **Xong khi:** W2-27 tiêu chí (f), (g), (h).

### B10d — Báo Super Admin, thông báo chỉ định (S, `biz`)

- **File:** mới `src/modules/identity-access/it-coverage/` (`it-coverage.job.ts`, `it-coverage-sweep.service.ts`,
  `it-coverage-notifier.service.ts`, + spec); `identity-access/identity-access.module.ts` (hoặc module wiring tương ứng);
  `organization/department-it-substitute/department-it-substitute.service.ts` (gọi thông báo chỉ định/gỡ); bốn file
  `notifications` như B5c (ba mã `DEPARTMENT_IT_SUBSTITUTE_APPOINTED`, `_ENDED`, `DEPARTMENT_IT_COVERAGE_MISSING`); I thêm ca (i)
  vào `department-it-substitute.integration-spec.ts`.
- **Làm:** SPEC W2-27 (c) phần thông báo, W2-26 ba mã.
- **REVIEW-SPEC-2 (S2-8):** loại **phòng khởi tạo**; lượt (e) chỉ đọc bảng chỉ định của `organization` (chỉ định hiệu lực mà người
  được chỉ định không dùng được) — không đọc việc của module tầng trên.
- **Xong khi:** W2-27 tiêu chí (b phần thông báo), (i).

### B10e — QĐ-118 cho báo lỗi SaaS, đánh giá Request, ghost seat phía IT (M, `biz`)

- **File:** `src/modules/licensing/saas-issue/saas-issue-handling.service.ts`, `saas-issue.errors.ts`, `saas-issue.http-errors.ts`,
  `saas-issues.controller.ts` (mô tả 403); `src/modules/requests/assessment/assessment.policy.ts` (+ spec),
  `need-decision-effects.service.ts`, `request-resubmission.service.ts`, errors/http-errors của assessment; `src/modules/optimization/board/board-reclaim.service.ts`,
  `decision/decision-return.service.ts`, errors/http-errors của ghost seat; I mới `test/integration/licensing/saas-issue-in-charge.integration-spec.ts`,
  `test/integration/requests/assessment-in-charge.integration-spec.ts`, `test/integration/optimization/ghost-seat-in-charge.integration-spec.ts`.
- **Làm:** SPEC W2-27 (d) H9–H11. Vượt ~12 file ⟹ tách theo module, ghi _OVERNIGHT_.
- **REVIEW-SPEC-2:** H10 theo **phòng người xin** (S2-7). H18 phần requests/optimization: `request-status-recipients.service.ts:43-45`,
  `step-target.service.ts:36,125-129` (bước `IT_ASSESSMENT`; giao lại nhờ `WAITING_RETRY` sẵn có), `controlled-wait-query.service.ts:27`,
  `decision-routing.service.ts:177`, `decision-reminder.service.ts:61` (S2-6). Tiêu chí thêm (u).
- **Xong khi:** W2-27 tiêu chí (k) phần báo lỗi, đánh giá, ghost seat.

### B10f — QĐ-118 cho bước hồ sơ nghỉ việc, dừng thu thập (S, `biz`)

- **File:** `src/modules/personnel/offboarding/offboarding-frame.service.ts` (**không thêm file**, thư mục 25 file),
  `offboarding.http-errors.ts` hoặc file ánh xạ có sẵn của capability; `src/modules/devices/stop-request/*` (service hoàn tất,
  errors, http-errors, controller mô tả); I mới `test/integration/personnel/offboarding-step-in-charge.integration-spec.ts`,
  `test/integration/devices/stop-request-in-charge.integration-spec.ts`.
- **Làm:** SPEC W2-27 (d) H12, H13 (H12 trả 404 như route đọc, W2-D19).
- **REVIEW-SPEC-2 (S2-4, H16b):** `src/modules/personnel/it-handover/it-handover.controller.ts` (`offboardingCaseItAdminHandover`,
  `departmentTransferItAdminHandover` ⟹ `@RequireRoles('SUPER_ADMIN')`, mô tả 403), spec/I của it-handover; không thêm file ở
  `offboarding/`. H12 trả 403 `OFFBOARDING_CASE.NOT_IN_CHARGE` khi trong phạm vi đọc (S2-2). Tiêu chí thêm (v).
- **Xong khi:** W2-27 tiêu chí (k) phần hồ sơ nghỉ việc, dừng thu thập.

### B10g — Người nhận thông báo theo QĐ-118 (M, `biz`)

- **File:** tám notifier ở SPEC W2-27 H15 (`devices/stop-request/stop-request-notifier.service.ts`,
  `licensing/department-tools/department-software-notice.service.ts`, `requests/…/request-status-recipients.service.ts`,
  `vendor-account-review-notifier.service.ts`, `catalog/…/seat-increase.service.ts`, `personnel/event-notice/personnel-notifier.service.ts`,
  `beneficiary-gone-it-notice.service.ts`, `internal-rules-g2.service.ts`) + spec chọn người nhận của từng file; nhắc gia hạn
  `licensing/subscription-renewal/subscription-renewal-parties.service.ts:30` nếu B10c chưa đổi.
- **Làm:** SPEC W2-27 H15: người nhận = người làm của phòng; rỗng ⟹ Super Admin. `seat-increase.service.ts` nằm ở `catalog/` nhưng
  không thuộc file của T3/T3b (kiểm danh sách PLAN trước khi sửa; trùng ⟹ _Bàn giao_). Vượt ~12 file ⟹ tách hai gói.
- **REVIEW-SPEC-2:** H15b (`itHandoverPending` ⟹ Super Admin; `vendorAdminsGone`, `seat-increase` ⟹ IT phụ trách thuê bao, không
  ⟹ Super Admin; `usage-stale-notice` giữ mọi IT, W2-D22) và H18 phần licensing: `licensing-alerts.service.ts:31-35`,
  `expiry-reminder.service.ts:55-64,172` (S2-5, S2-6). Vượt ~12 file ⟹ tách hai gói.
- **Xong khi:** W2-27 tiêu chí (m); unit người nhận xanh cho cả tám notifier.

### B10h — Việc của người chưa xếp phòng (M, `biz`, W2-Q8)

- **File:** mới `src/modules/organization/unplaced-work-designation/` (`.controller.ts`, `.dto.ts`, `.service.ts`, `.repo.ts`,
  `.policy.ts` + spec, `.errors.ts`, `.http-errors.ts`, `.mapper.ts`); `organization/public/organization-read.api.ts`
  (`itAdminsActingForUnplacedWork`); `organization/organization-http.module.ts`/`organization.module.ts`; chỗ gọi khi phòng `NULL`:
  `licensing/provisioning/provisioning-task-frame.service.ts`, `revocation-completion/revocation-completion.service.ts`,
  `tasks/provisioning-task.repo.ts` (danh sách `MINE`), `personnel/offboarding/offboarding-frame.service.ts` (**không thêm file**),
  `devices/return-task/*` (người làm việc, danh sách `MINE`), `devices` chỗ kiểm H17 (`judgeDeviceActor` dùng chung); sinh thông
  báo `UNPLACED_WORK_WAITING` ở chỗ tạo hồ sơ nghỉ việc rút gọn và tác vụ thu hồi; `identity-access/it-coverage/` (lượt người
  được chỉ định không dùng được); bốn file `notifications` như B5c (một mã); I mới
  `test/integration/organization/unplaced-work-designation.integration-spec.ts`.
- **Làm:** SPEC W2-27 (e), §4.3 câu phòng `NULL`, W2-26 mã `UNPLACED_WORK_WAITING`. Không viết lại hàng chung; người làm qua chỉ
  định ⟹ `bySubstitute: true`, chỉ Audit Trail (W2-Q9). Vượt ~12 file ⟹ tách B10h-1 (organization + bộ giải + route) và B10h-2
  (bốn chỗ gọi + thông báo), ghi _OVERNIGHT_.
- **REVIEW-SPEC-2:** "chưa xếp phòng" = **chưa từng** (S2-1); khóa hai employee một câu (S2-9); 422 `NOT_USABLE_IT_ADMIN`
  (S2-14); thông báo `UNPLACED_WORK_DESIGNATED` (S2-15); bốn chỗ đóng việc gọi `OrganizationApi.endUnplacedWorkDesignations`
  (`WORK_CLOSED`, S2-8). Tiêu chí (q) thêm ca tác vụ thu hồi.
- **Xong khi:** W2-27 tiêu chí (q), (r).

### B11 — RC-9 (S, `biz`)

- **File:** `src/modules/personnel/transfer-grace/transfer-revocation.service.ts` (+ `transfer-revocation.service.spec.ts`),
  `transfer-revocation.controller.ts` (mô tả 404); **không thêm file** (thư mục 25 file); I mới hoặc thêm ca
  `test/integration/personnel/transfer-revocation-reopen.integration-spec.ts`.
- **Làm:** SPEC W2-28.
- **REVIEW-SPEC-2 (S2-2):** ngoài phạm vi đọc ⟹ 404; trong phạm vi đọc mà không phải người làm ⟹ 403
  `DEPARTMENT_TRANSFER.NOT_IN_CHARGE`.
- **Xong khi:** W2-28 tiêu chí.

### B9 — Chốt làn `biz` (S)

- **File:** `src/modules/devices/README.md`, `licensing/README.md`, `catalog/README.md`, `requests/README.md`,
  `personnel/README.md`, `organization/README.md`, `identity-access/README.md`, `onboarding/README.md`,
  `notifications/README.md` (bảng mã, `:37`; S-25) (dùng ghi chú _Bàn giao_ của `PROGRESS-tech.md` cho phần của làn `tech`);
  `docs/rules/security-jobs.md` (đoạn `DeviceReturnOverdueSweeper`, `ItCoverageSweeper`, theo mẫu `StopRequestSweeper`);
  `docs/rules/database-business.md` (bảng _Thứ tự khóa chuẩn_ có sẵn `:266-300`: thêm 0b, 0c, 2b, 6b, ngoại lệ E4; không ghi lại
  tầng 8); `docs/generated/routes.md`, `docs/generated/module-graph.md` (`pnpm arch:routes`, `pnpm arch:graph`); `FIX-TEST-biz.md`.
- **REVIEW-SPEC-2 (S2-9):** bảng thứ tự khóa ghi "chỉ định làm thay: employee (tầng 1) → phòng (tầng 2)".
- **Kiểm:** bộ nhanh + `pnpm rules:format` + `pnpm arch:docs:check`.

### T6 — Seed theo luật mới (M, `tech`, pha 2)

- **Điều kiện:** làn `biz` báo B9 xong trên `int/redesign-w2`; `git fetch origin && git merge origin/int/redesign-w2` vào nhánh
  `tech` (không rebase).
- **File:** `src/cli/seed/fixture/demo-fixture.types.ts` (`DemoDevice` + `deviceType`, `serialNumber`, `initial`, `bundled`,
  `activations`, `condition`), `fixture/shared-demo-v4/devices.ts`, `catalog.ts`/`catalog-extra.ts` (gói _Windows 11 Pro OEM_,
  _Office LTSC 2024_, khoản mua, khóa), `README.md` của fixture (`:382-390`); `src/cli/seed/steps/devices.steps.ts` (+ spec, tách
  `DEVICE_INITIAL_STEPS`), `assets.steps.ts` (+ spec), `catalog.steps.ts` (+ spec, `keyBinding`), `baseline.steps.ts`, bước chỉ
  định làm thay (mới, trong step của `personnel` hoặc file step mới), `renewals.steps.ts`/step khác **chỉ nếu** đang dựa "IT khác
  làm thay"; `src/cli/seed/seed-steps.ts` (**sắp lại mảng** `demoSteps`) + spec thứ tự.
- **Làm:** SPEC W2-25 (S-14). Không nới luật nào cho seed; không chạy seed.
- **Xong khi:** mọi spec unit của `src/cli/seed` xanh; dòng "chờ T6" của `FIX-TEST-biz.md` được báo cho Owner để gỡ.

### T7 — Chốt làn `tech` (S)

- `FIX-TEST-tech.md`; `pnpm openapi:export`, `pnpm arch:routes` nếu T6 chạm; báo cáo cuối theo CODE-PROMPT §7.

---

## Sau hai làn

1. Owner merge nhánh `tech` vào `int/redesign-w2`, gộp tay file chung, chạy CI đầy đủ trên nhánh gộp
   (`gh workflow run ci.yml --ref int/redesign-w2`).
2. Opus review + merge audit trên nhánh gộp (`docs/reviews/redesign-w2-2026-11-22/REVIEW.md`): migration, trigger, raw SQL, thứ tự
   khóa (SPEC §6, E4), quyền (QĐ-118), đổi contract (SPEC §7.2, §7.3), các dòng SPEC §12.
3. Sửa finding theo làn; CI lần 2; PR `int/redesign-w2 → dev` (**trước** khi đợt 3 code M6, W2-Q1); API description đợt 2 ở
   `Docs/Figma UI-UX/API-Integration/` (đánh dấu 5 operation phá contract, mục _Đổi enum response_, 44 operation đổi quyền, bốn
   route của tab _Thu thập_).
