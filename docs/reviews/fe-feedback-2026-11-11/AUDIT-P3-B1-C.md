# AUDIT-P3-B1-C — Danh mục, nhóm chức năng, logo (CT-1, CT-1.L1–L3) và cài đặt

- **Phạm vi:** `dc879586..a4e31ff5` (nhánh `feat/fe-feedback`), vùng C: `src/modules/catalog/**` (catalog-entry, application-intake,
  functional-group, plan, subscription/pool + price phần K4, public), `src/modules/installation/**`, chỗ đọc `logoUrl` ở `licensing`
  (department-tools, my-software) và `catalog/requestable-software`, migration `20261113003400`…`003800`, seed `catalog.steps.ts`.
- **Cách làm:** chỉ đọc qua `git show a4e31ff5:<path>` / `git diff dc879586..a4e31ff5`; không chạy pnpm/jest/docker, không sửa code.
- **Nguồn đối chiếu:** QĐ-111b/d/e/f/bf (Docs `Decisions/project-decisions.md`), BRD FR-1.2/FR-6.8, EP-04, SPEC v2.1 §CT-1 + §6,
  PLAN CT-1.1–1.8, OVERNIGHT-DECISIONS D-12, D-32…D-36, `docs/rules/module-structure.md`, `database-business.md`, `api-contract.md`.
- **Skill đã dùng:** `agent-skills:code-review-and-quality` (khung 5 trục, mức finding), `superpowers:verification-before-completion`
  (mọi kết luận có dòng code làm bằng chứng; không tuyên bố test xanh vì không chạy).

Tổng: **0 Critical · 3 Required · 11 Optional · 7 Nit.**

---

## Required

### C-R1 · Required · Đổi gói đang có thuê bao kỳ hạn (`TERM`) sang `K4` vẫn qua, để lại thuê bao `TERM` trên gói "mua một lần"

- **Chỗ:** `src/modules/catalog/plan/plan.service.ts:192` + `:239-246` (`pricingModelOf` suy lại `null` khi đổi sang `K4`);
  `prisma/migrations/20261113003800_ct1_plan_keeps_perpetual/migration.sql:31-37` (chỉ chặn chiều **rời** `K4`, không chặn chiều **vào**);
  hậu quả ở `src/modules/catalog/subscription/pool/subscription-pool.policy.ts:55` và
  `src/modules/catalog/subscription/subscription-period.service.ts:203-211`.
- **Kịch bản:** gói Slack Pro `K2`, thuê bao `TERM` `ACTIVE` 10 seat, 6 seat đang gán. IT `PATCH /plans/{id} { provisioningType: 'K4' }`:
  `assertPlanShape` qua (K4 không cần mô hình giá), `pricingModelOf` trả `null` (PER_SEAT ⟹ NULL), trigger `plans_keep_children_valid` không
  có nhánh nào cho `OLD ≠ K4 → NEW = K4` ⟹ 200. Từ đây: (1) thuê bao `TERM` treo trên gói `K4`, trái luật vừa thêm ở `203cbbb3`
  ("a K4 plan is bought once, so only a perpetual purchase is written for it"); (2) kỳ gia hạn kế tiếp bị `assertNextPeriod` →
  `assertPoolTerms` → `SubscriptionK4PerpetualOnlyError` → `SubscriptionPeriodRefusedError('INVALID_TERMS')`: thuê bao **không gia hạn được**;
  mọi `PATCH /subscriptions/{id}` chạm điều khoản cũng 422 `SUBSCRIPTION.K4_PERPETUAL_ONLY`; (3) `seatTracking` đổi `APPLICABLE →
  NOT_APPLICABLE`, `missingData` thôi đòi số lượng — màn hình mất phần seat trong khi seat vẫn đang được giữ. Trước CT-1 cùng thao tác giữ
  nguyên `PER_SEAT` và `K4 TERM` còn hợp lệ, nên đây là hồi quy do kết hợp `c2b15c32` (suy lại mô hình giá) + `203cbbb3` (K4 chỉ PERPETUAL).
  `K1 → K4` cũng vậy.
- **Căn cứ:** B-5 / `QĐ-111f` (`K4` mua một lần), D-36 (chính Sonnet chốt K4 chỉ PERPETUAL), `database-business.md` (luật ở DB, không chỉ
  check-then-write), cách làm đối xứng của `plans_change_keeps_perpetual`.
- **Sửa:**
  1. Migration mới `2026111300xx_ct1_plan_enters_k4_without_terms` (`CREATE OR REPLACE FUNCTION plans_keep_children_valid`, giữ nguyên bốn
     nhánh hiện có, thêm):
     ```sql
     IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K4'
        AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'TERM') THEN
         RAISE EXCEPTION 'plan_change_blocked: TERM_SUBSCRIPTIONS'
             USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_terms';
     END IF;
     ```
     (nếu muốn cho thuê bao `TERM` đã `ENDED`/hết hạn thì lọc thêm theo `status`; mặc định chặn mọi `TERM` cho đơn giản và an toàn).
  2. `PlanChangeBlock` (`plan.errors.ts:177`) + `CHANGE_BLOCKS` (`plan.service.ts:~280`) thêm `'TERM_SUBSCRIPTIONS'`; mô tả 409 ở
     `plans.controller.ts` (CONFLICT_DESCRIPTION) liệt kê lý do mới.
  3. Ghi thành bổ sung D-36 trong OVERNIGHT-DECISIONS.
- **Test:** integration `catalog-licensing-write-integrity`: gói `K2` có thuê bao `TERM` → `PATCH { provisioningType: 'K4' }` ⟹ 409
  `PLAN.IN_USE_BLOCKS_CHANGE` `details.reason = 'TERM_SUBSCRIPTIONS'`, gói vẫn `K2`/`PER_SEAT`; gói `K2` không thuê bao → sang `K4` vẫn 200;
  SQL thô `UPDATE plans SET provisioning_type='K4'` ⟹ 23514 `plans_change_keeps_terms`. Mutation: xóa nhánh trigger ⟹ test đỏ.

### C-R2 · Required · D-36 được commit "tạm chốt" nhưng không có trong OVERNIGHT-DECISIONS; D-32 và D-33 đã lỗi thời

- **Chỗ:** `docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md` (dừng ở D-35, dòng 295); commit `203cbbb3` ghi "tạm chốt D-36";
  D-32 dòng 271 ("Không ép `K4` ⟹ luôn `PERPETUAL`", "`pricingModel` có ⟹ giữ"); D-33 dòng 281 ("Kiểm trùng nằm trong transaction nhưng
  không khóa: hai lệnh đồng thời … có thể cùng qua").
- **Kịch bản:** Owner duyệt sổ D-n sẽ không thấy hai luật mới đã lên dây: 422 `SUBSCRIPTION.K4_PERPETUAL_ONLY`, 422
  `PLAN.PRICING_MODEL_NOT_DERIVED` (`details.expected`), "gói cũ giữ mô hình giá tới khi đổi kiểu cấp", 409 `PERPETUAL_SUBSCRIPTIONS`;
  đồng thời D-32/D-33 nói điều ngược với code (`203cbbb3` ép K4 ⟹ PERPETUAL; `a2220e4c` thêm advisory lock). FE đọc mục "FE cần biết"
  của D-32 sẽ tưởng `pricingModel` gửi tùy ý vẫn được giữ.
- **Căn cứ:** quy trình tạm chốt của suite (mọi D-n phải có câu hỏi/phương án/đã chọn/căn cứ/đổi lại), `api-contract.md` (mã lỗi mới phải có
  chỗ FE đọc).
- **Sửa:** thêm `### D-36 — K4 chỉ mua một lần; mô hình giá gửi lên phải đúng mô hình suy` (câu hỏi, phương án A/B, đã chọn, căn cứ
  B-5/`QĐ-111f`, file/commit `203cbbb3`, `aeee6f56`, `c2b15c32`, migration `…003800`, đổi lại, FE cần biết: hai mã 422 + `details.expected`,
  lý do 409 mới, kèm C-R1). Sửa D-32: gạch câu "Không ép…" và "có ⟹ giữ" bằng dòng _Cập nhật theo review: xem D-36_. Sửa D-33(1):
  _Cập nhật theo review (`a2220e4c`): kiểm trùng chạy dưới `pg_advisory_xact_lock` theo tổ chức_.
- **Test:** không cần.

### C-R3 · Required · Module card không cập nhật khi public API của `catalog` và phụ thuộc của `installation` đổi

- **Chỗ:** `src/modules/catalog/README.md:9-40` (mục _Public API_) và danh sách capability (`:60-80`); `src/modules/installation/README.md:7`.
- **Kịch bản:** CT-1 thêm facade mới `CatalogBootstrapApi` (`public/catalog-bootstrap.api.ts`) + Nest module
  `catalog-bootstrap-facade.module.ts`, policy dùng liên capability `public/catalog-duplicate.policy.ts` (đăng ký `PUBLIC_ROOT_POLICY_FILES`),
  capability mới `application-intake/` (route `POST /applications`), và `installation` nay phụ thuộc `catalog`. Cả hai README không nhắc dòng
  nào (`git diff --stat` hai file rỗng); `installation/README.md:7` vẫn ghi "Phụ thuộc: organization, identity-access, finance, audit".
- **Căn cứ:** `docs/rules/module-structure.md:296` — "module card cập nhật khi public API hay extension point đổi" (luật chỉ review bắt).
- **Sửa:** catalog README thêm gạch đầu dòng `CatalogBootstrapApi` (`seedStandardFunctionalGroups(tx, organizationId)`, dùng bởi
  `installation`, facade module không controller), `public/catalog-duplicate.policy.ts` (`duplicateOf`, người dùng: `application-intake`,
  sắp tới cửa case B IN-1), capability `application-intake/` (một lệnh ứng dụng + gói, lock kiểm trùng), ghi `CatalogApi.getCollectorApplications`
  nay trả `logoUrl` và cờ liên lạc suy từ nhóm; installation README thêm `catalog (CatalogBootstrapApi)` vào phụ thuộc và nêu 7 nhóm chuẩn.
- **Test:** không cần.

---

## Optional

### C-O1 · Optional · Hai đường tạo/đổi ứng dụng khác chưa đi qua luật trùng `QĐ-111b`

- **Chỗ:** `src/modules/catalog/internal-software-registration/internal-software-registration.service.ts:31` (đăng ký phần mềm nội bộ cho
  Request case B), `src/modules/catalog/catalog-entry/application.service.ts:261-264` (`PATCH /applications/{id}` đổi tên/tên miền).
- **Kịch bản:** catalog có "Figma" (vendor Figma). IT đánh giá một case B nội bộ tên "Figma" ⟹ `register` tạo ứng dụng `INTERNAL` "Figma"
  (khác vendor nên chỉ mục DB không chặn). Hoặc IT đổi tên ứng dụng khác thành "figma". Cả hai không lấy advisory lock, không gọi `duplicateOf`.
- **Căn cứ:** `QĐ-111b` ("IT tạo ứng dụng/gói trùng ⟹ từ chối thao tác tạo kèm mục đã có"); SPEC map vế IT của `b` cho CT-1 + IN-1.
- **Đề xuất:** A (khuyến nghị) — làm ở IN-1: trước `declareRecord` trong `register` gọi `facts.lockDuplicateCheck` + `duplicateCandidates`
  + `duplicateOf`, trả `{ status: 'REFUSED', reason: 'DUPLICATE', existing }` để cửa đánh giá chuyển sang `catalog-link`; PATCH đổi tên chạy cùng
  luật (loại trừ chính nó). B — giữ, ghi hở ở HANDOFF. Test: integration đăng ký nội bộ trùng tên ⟹ REFUSED, không ứng dụng mới.

### C-O2 · Optional · `PATCH /plans` gửi lại đúng mô hình giá cũ của gói cũng bị 422

- **Chỗ:** `src/modules/catalog/plan/plan.policy.ts:89`, `plan.service.ts:203`.
- **Kịch bản:** gói `K2` cũ có `FLAT_RATE`. Form sửa gói của FE gửi lại toàn bộ trường, kể cả `pricingModel: 'FLAT_RATE'`, chỉ để đổi tên ⟹
  422 `PLAN.PRICING_MODEL_NOT_DERIVED` dù không đổi gì về giá. Không gửi thì giữ (D-36) — hai hành vi khác nhau cho cùng ý định.
- **Đề xuất:** A — trong `update` bỏ qua kiểm khi `input.pricingModel === current.pricingModel && next.provisioningType ===
  current.provisioningType`; B — giữ và ghi rõ ở "FE cần biết" của D-36 rằng form sửa không được gửi `pricingModel`. Test unit cho nhánh bằng nhau.

### C-O3 · Optional · Gói `K4` cũ (`PER_SEAT`) và gói `K4` mới (`NULL`) trả `seatTracking` khác nhau

- **Chỗ:** `plan.service.ts:239-246`, `plan.mapper.ts` (`seatTrackingOf`), migration `…003500` (CHECK cho `K4` mọi giá trị).
- **Kịch bản:** cùng là gói "mua một lần", JetBrains cũ hiện `seatTracking: APPLICABLE`, gói K4 tạo hôm nay hiện `NOT_APPLICABLE`; FE phải
  đoán. Không thấy hỏng dữ liệu (`missingData` vẫn đòi số lượng cho PERPETUAL; G1 đã loại K4 — `ghost-seat-g1` "Q-12, K4").
- **Đề xuất:** A — giữ (D-36), ghi FE: hiển thị theo `provisioningType`, không theo `seatTracking`; B — migration dữ liệu đặt
  `pricing_model = NULL` cho mọi gói `K4` sau khi rà nơi đọc (`subscriptions_fit_plan` nhánh per-seat, `rule-seats.repo`), có đếm trước.

### C-O4 · Optional · Migration `…003400` đổi nhóm của ứng dụng mà không để dấu vết

- **Chỗ:** `prisma/migrations/20261113003400_ct1_functional_groups_system_key/migration.sql:66-74`.
- **Kịch bản:** ứng dụng có cờ liên lạc cũ đang ở nhóm "Văn phòng & cộng tác" bị chuyển sang _Liên lạc_ (D-33(3)); IT mở chi tiết thấy nhóm đổi,
  audit không có sự kiện nào.
- **Đề xuất:** A — ghi danh sách ứng dụng bị chuyển (đếm trước trên seed v4 như SPEC §6 yêu cầu "ứng dụng cờ liên lạc; ứng dụng chưa có nhóm")
  vào HANDOFF; B — thêm một dòng audit hệ thống mỗi ứng dụng (như FX-1 làm cho quy đổi giá). A đủ cho đồ án.

### C-O5 · Optional · Seed demo để mọi ứng dụng ở _Khác_ (Slack không ở _Liên lạc_)

- **Chỗ:** `src/cli/seed/steps/catalog.steps.ts:52-60` ("No group is named: the application stands in Khác").
- **Kịch bản:** demo màn "Loại" toàn _Khác_; Slack (chat) không được luật chặn usage `QĐ-111e` bảo vệ trong dữ liệu demo.
- **Đề xuất:** A — để Z2 (seed cuối), thêm `functionalGroup` vào fixture (Slack → Liên lạc, ChatGPT/Cursor → Trợ lý AI, Figma/Canva → Thiết kế,
  GitHub/Jira/Postman/JetBrains → Lập trình, …) và seed tra id nhóm qua `GET /functional-groups`; ghi vào Z2 của PLAN.

### Điểm Sonnet tự chốt trong vùng (D-n)

| D-n  | Nội dung                                                                                         | Đối chiếu                                   | Mức · đề xuất                                                         |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------- |
| D-12 | Cài đặt chỉ nhận `VND` (refine `=== DONG`), giữ kiểm bảng tiền tệ                                 | Khớp `QĐ-111an`, R-4                        | Optional · **A** giữ; mã `REPORTING_CURRENCY_NOT_SUPPORTED` chết dọn sau |
| D-32 | Một lệnh ứng dụng + gói; ứng dụng `SAAS`/`INTERNAL` suy từ gói; `pricingModel` tùy chọn ở `/plans` | Khớp `QĐ-111d/f`; phần "không ép K4" lỗi thời | Optional · **A** giữ thiết kế; sửa chữ theo C-R2                      |
| D-33 | Trùng = cả danh mục `APPROVED`, tên chuẩn hóa hoặc host; 7 nhóm trong audit cài đặt; cờ liên lạc ⟹ _Liên lạc_ | Khớp `QĐ-111b/e/bf`; câu "không khóa" lỗi thời | Optional · **A** giữ; sửa chữ theo C-R2                               |
| D-34 | Hàm `ensure_other_functional_group` + trigger `BEFORE INSERT` rồi `SET NOT NULL`                  | Khớp `QĐ-111d`, MAJ-7, `database-business.md` | Optional · **A** giữ (đã kiểm race: UPDATE chờ khóa dòng, INSERT `ON CONFLICT` rồi đọc lại) |
| D-35 | Logo: `https://` không khoảng trắng, ≤ 500, rỗng ⟹ 422, `null` xóa, CHECK DB; danh sách nơi đọc   | Owner miệng 14/11; schema chặt hơn CHECK (`\S` JS ⊇ `[:space:]` PG) nên không lọt 500 | Optional · **A** giữ                                          |
| D-36 | `K4` chỉ PERPETUAL; mô hình giá gửi lên phải đúng mô hình suy; gói cũ giữ mô hình                  | Khớp B-5/`QĐ-111f`; **chưa ghi sổ** (C-R2); hở chiều vào K4 (C-R1) | Optional · **A** giữ thiết kế sau khi sửa C-R1, C-R2           |

---

## Nit

- **C-N1** · `src/modules/catalog/plan/plan.repo.ts:337,374` — `search` lấy toàn bộ id khớp rồi đưa vào `where.id = { in: [...] }`: danh sách
  không chặn (Prisma bind tối đa 32767 tham số). Danh mục nhỏ nên chưa hỏng; gọn hơn: lọc `EXISTS` trong một `$queryRaw` hoặc giới hạn
  `idsMatching` bằng các filter khác.
- **C-N2** · `src/modules/catalog/catalog-entry/application.http-errors.ts:131-136`, `application.errors.ts:100`,
  `application-intake.service.ts:81` — ví dụ OpenAPI `APPLICATION.DUPLICATE` ghi `functionalGroup: null` và kiểu cho phép null, trong khi nhóm
  nay luôn có (NOT NULL). Đổi kiểu thành không null, ví dụ `{ id: '<group-id>', name: 'Khác' }`, bỏ `?? null`.
- **C-N3** · `src/modules/catalog/catalog-entry/application.service.ts:110` — `ApplicationService.declare` chỉ còn builder test gọi; trong `src`
  là đường tạo ứng dụng không kiểm trùng, cho `LICENSED`. Ghi chú `@internal for tests` hoặc chuyển builder sang `declareRecord`.
- **C-N4** · `src/modules/catalog/catalog-entry/application.repo.ts:134` — `take: 20` sắp theo tên: nếu > 20 mục chung tên miền đứng trước
  mục trùng tên, `duplicateOf` báo `matchedBy: DOMAIN` thay vì `NAME` (vẫn 409). Tách hai truy vấn (tên trước) hoặc sắp `normalizedName = $key` lên đầu.
- **C-N5** · `src/modules/catalog/catalog-entry/application.dto.ts:47,71`, `application-intake.dto.ts:32`, `requestable-software.dto.ts` —
  `dataSensitivity: null` chưa có mô tả; EP-04/BRD gọi là "chưa đánh giá (`UNRATED`, FR-6.8)". Thêm `.meta({ description: 'null = not rated yet' })`.
- **C-N6** · Logo trỏ server bên ngoài: mỗi lần FE hiện ảnh, host đó thấy IP/Referer của nhân viên. Thêm vào mô tả hoặc ghi FE dùng
  `referrerpolicy="no-referrer"`.
- **C-N7** · `src/modules/catalog/plan/plan.service.ts:263` — `planNamed` đọc bằng kết nối khác trong khi kết nối transaction (khi có `outer`) vẫn
  được giữ; dưới tải cao tốn thêm một kết nối pool. Chấp nhận được; có thể đọc sau khi transaction ngoài kết thúc.

---

## Test bị sửa/xóa và rủi ro CI

- Các assertion bị xóa trong `application-http.integration-spec.ts` (AC-2/AC-3 cờ liên lạc, `FREE_EXTERNAL`, "cùng tên khác vendor được"),
  `plan-http.integration-spec.ts` (`PRICING_MODEL_REQUIRED` cho K4, `FLAT_RATE`) đều là hành vi đã bỏ theo `QĐ-111b/e/f`; chỗ thay thế kiểm
  hành vi mới (trùng khác vendor ⟹ 409, mô hình suy, `PRICING_MODEL_NOT_DERIVED`). Không thấy assertion bị nới không lý do.
- `test/support/application-body.ts` (`intakeBodyOf`) và `builders/catalog.builder.ts` + `legacy-pricing.ts` (ghi mô hình giá cũ bằng SQL) là
  cầu nối cho suite cũ, không chứa assertion — chấp nhận, nhưng chúng che việc route nay từ chối `pricingModel` lệch kiểu cấp.
- Đã rà các suite dựng thuê bao trên gói `K4` (13 file có `provisioningType: 'K4'`; `renewal-harness.term`, `seat-baseline-harness`,
  `request-amount-term`, `ghost-seat-world` chèn SQL): đều đã chuyển sang `PERPETUAL` hoặc đi SQL thô, chưa thấy suite chắc chắn đỏ vì
  `K4_PERPETUAL_ONLY`. **Không chạy test** — kết luận này là đọc tĩnh, CI full mới xác nhận được.
- Thiếu test cho C-R1 (chiều vào `K4`). Các test SPEC đòi đều có: rollback một lệnh (`application-intake-http` "leaves nothing behind"),
  đăng ký nội bộ sau `SET NOT NULL` (`access-request-internal-registration`), migration `…003400`/`…003600`, lock trùng đồng thời.
- Kiến trúc: `application-intake` dùng nội bộ `catalog-entry`/`plan` cùng module (được phép); policy `public/` đã đăng ký gate; facade
  `CatalogBootstrapApi` đúng tầng (installation T6 → catalog T4); `licensing` đọc logo qua `CatalogApi`, không query bảng `applications`.
  Thư mục `catalog/subscription/` đang đúng trần 25 file. OpenAPI không chứa mã QĐ.
