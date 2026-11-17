# AUDIT P3 — Verify FIX-B1 (vùng Y): merge 0f3d07d8, B1A-02, B1A-03, C-R1, C-R2, C-R3

- Ngày: 15/11/2026. Reviewer: Opus, CHỈ ĐỌC (git show / bản sạch `be-verify` ở `47fb5097`). Không chạy pnpm/jest/docker, không sửa code.
- Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (process + review 5 trục, nhãn Critical/Required/Optional/Nit);
  `superpowers:verification-before-completion` (bằng chứng trước kết luận — vì brief cấm chạy test, mọi kết luận "xanh/đỏ" dưới đây là **đọc tĩnh**,
  ghi rõ chỗ là dự đoán).
- Nguồn nghiệp vụ đã đối chiếu: `QĐ-111an` (giá chỉ VND, "sau đó IT tự cập nhật"), `QĐ-111f`/B-5 (K4 mua một lần), D-32, D-33, D-36, D-45, D-46, D-48.

## Tóm tắt

| Mục | Kết luận |
| --- | --- |
| (a) merge `0f3d07d8` | **Không mất gì**. Chỉ một file xung đột (`catalog.steps.ts`), giữ đúng cả hai phía. Migration: nhánh `feat/mf2-mf3` không thêm migration nào sau base `dc879586` ⟹ không trùng/lẫn số. Fixture R28 + bảng trạng thái vào đủ. 1 Nit (FY1-07). |
| (b) `3ce3328b` B1A-02 | **SỬA CHƯA ĐỦ**: seed hết gọi route tỷ giá, hết USD, hết `expectedEndDate`, hết `pricingModel`/`LICENSED` (grep sạch). Nhưng thêm `contractEndInDays: 20` cho NV-CTR1 làm **flow nightly `mf1-group-request` đỏ** (FY1-01, Required). |
| (c) `21914df6` B1A-03 | **ĐÃ SỬA ĐÚNG** phần chính (nguồn giá gói chỉ đọc VND; PATCH không hạ `ACTIVE`→`DRAFT`, 422 `STILL_DRAFT`). Còn một đường đọc giá theo thuê bao đi vòng (FY1-03, Optional) và câu "mọi đường đọc giá đi qua đây" của D-46 sai. |
| (d) `fc272d94` C-R1 + `20261113004000` | **ĐÃ SỬA ĐÚNG**. Trigger giữ nguyên 4 nhánh cũ (so từng dòng với `…003800`), thêm nhánh vào K4; không quét dữ liệu nên deploy không fail; race an toàn (ghi thuê bao khóa plan `FOR UPDATE`/`FOR SHARE`); số migration tăng dần sau mọi migration của cả hai nhánh. 2 Optional test/dữ liệu cũ (FY1-04, FY1-05). |
| (e) `af7d45e9` C-R2 | **ĐÃ SỬA ĐÚNG**: D-32/D-33/D-36 khớp code (đã đối chiếu `assertPricingModelDerived`, `assertTermOfKind`, `lockDuplicateCheck` trước `duplicateCandidates`, `pricingModelOf`). |
| (e) `63e1365d` C-R3 | **ĐÃ SỬA ĐÚNG**: module card catalog/installation khớp code (`CatalogBootstrapApi.seedStandardFunctionalGroups`, `duplicateOf` dùng `searchKey`, `collectorApplications` suy cờ liên lạc từ `systemKey === 'COMMUNICATION'`, CHECK logo ≤ 500 https). |
| (e) `61e910fc` phần catalog | **Không nới assertion**: 3 expect của `missingDataOf` dời nguyên sang `price/subscription-price.policy.spec.ts` (tách 2 `it`); `subscription.policy.spec.ts` còn đúng 400 dòng; `subscription/` đúng 25 file. |

Số finding mới: **Required 2** (FY1-01, FY1-02), **Optional 4** (FY1-03…FY1-06), **Nit 2** (FY1-07, FY1-08). Không Critical.

---

## (a) Merge FIX-B1.0 `0f3d07d8` (`Merge branch 'feat/mf2-mf3' into feat/fe-feedback`)

Bằng chứng:
- `git show 0f3d07d8 --cc` chỉ có hunk `src/cli/seed/steps/catalog.steps.ts` (`planDifferences`). Kết quả: bỏ `pricingModel` (phía fe-feedback, CT-1/B-5) **và** giữ `hasAdminConsole` (phía mf2) — đúng. `planBody` (dòng 75-86 ở `47fb5097`) giữ `hasAdminConsole` của mf2, bỏ `pricingModel`; `oneApplication` (dòng 52-60) dùng lệnh một của CT-1 (`plan: firstPlanBody(first)`, không `kind`, không `communication`) — body này khớp `createApplicationBodySchema` strict (`application-intake.dto.ts:19-35`, `firstPlanSchema` = `declarePlanBodySchema` bỏ `applicationId`/`pricingModel`, vẫn có `hasAdminConsole`).
- File cả hai phía cùng sửa (`comm` của hai `git diff --name-only` từ base `dc879586`): `docs/generated/module-graph.md`, `catalog.steps.ts`, `test/support/ghost-seat-row.ts`, `ghost-seat-world.ts`. Hai file ghost-seat giống hệt nhau ở hai phía (cherry-pick `a3dd4e67` ↔ `2ec03e4f`; `git diff ^2 0f3d07d8` rỗng).
- `git diff --stat dc879586 ^2` (37 file) so với `git diff --stat ^1 0f3d07d8` (34 file): mọi file mf2 đều vào merge, trừ 3 file kể trên (đã có sẵn ở ^1 hoặc là file sinh). Không có file `src/modules/**` hay `prisma/**` nào ở phía mf2 ⟹ không mất logic nghiệp vụ MF-2/MF-3, không có thay đổi FX/RQ/CT nào bị phía mf2 ghi đè.
- Migration: phía mf2 dừng ở `20261113002700_requests_scope_removed_audit` (bằng base); phía fe-feedback thêm `…002800` → `…004000` liên tục, không trùng số.
- Seed/fixture chồng nhau: R28 (K5 phòng không trưởng phòng) có ở `requests.ts:224` và `test/support/seed-demo-v4-states.ts:30`; `software-list.steps.ts` gọi `/department-software-proposals` (không phải cửa case B `ACCESS_REQUEST.SOFTWARE_IN_CATALOG` của IN-1) ⟹ không đụng luật mới.

Kết luận: **merge không mất gì**. Một Nit về commit message (FY1-07).

## (b) `3ce3328b` B1A-02 — SỬA CHƯA ĐỦ

Phần đã đúng (grep `expectedEndDate|exchange|'USD'|LICENSED|pricingModel|communication|endDateOf|DemoRequestEnd` trong `src/cli/seed` và `test/**` dùng seed: chỉ còn `originalPrice … 'USD'` hợp lệ và các assertion phủ định):
- Bước `finance.exchange-rates` xóa khỏi `finance.steps.ts`, `seed-steps.ts`, `needs` của `catalog.subscriptions`; `DemoFixture.exchangeRates` bỏ.
- Cursor `508000 VND` + `originalPrice 20 USD` truyền ở `subscriptionTerms` (`catalog.steps.ts:211-217`) cho cả `POST` và `PATCH` bản nháp (dòng 285).
- `termBody` thay `withEnd` ở 3 đường gửi (`request.steps.ts:73,80,86`) và bản nháp (`extras.steps.ts`); `termRunOf` (`core/term-limit.ts:150-164`) neo theo ngày bắt đầu nên `termMonths: 1` = đúng 1 tháng giá ⟹ các ca ngân sách R10/R21/R11 giữ nghĩa.
- `POST /employees` gửi `contractEndDate` cho NV-CTR1 (`organization.steps.ts` `employeeBodyOf`); R16 (Jira K2, 3 tháng) bị cắt ở ngày hết hợp đồng = hôm nay + 20 ⟹ vẫn trong cửa sổ Request tiếp tục như trước.
- Suite seed (`seed.integration-spec`, `seed-rerun`, `seed-calendar`, `seed-bootstrap`, `_serial/seed-check-runtime`): đọc tĩnh không thấy assertion nào phụ thuộc bước tỷ giá, giá USD hay ngày R16 ⟹ dự đoán xanh (chưa chạy; `_serial` chưa ai chạy, D-45 dòng 487 tự ghi).

Phần chưa đủ: thay đổi dữ liệu của NV-CTR1 không được đối chiếu với các flow dùng chính người này ⟹ **FY1-01**.

## (c) `21914df6` B1A-03 — ĐÃ SỬA ĐÚNG (còn Optional)

- `subscription-priced.repo.ts:18,38`: `unitPriceCurrency: DONG` ở cả `livePricedOf` và `pricedOn` ⟹ `findPriceOfPlan` (`subscription.repo.ts:355-388`) và `findPricedCyclesOfPlans` trả null cho gói chỉ có thuê bao USD ⟹ `pricing.policy.ts:110/282` ra `NO_PRICED_SUBSCRIPTION`, không lưu số USD.
- `subscription-change.service.ts:117,152-163` (`statusAfter`): `ACTIVE` ⟹ `DRAFT` ném `SubscriptionStillDraftError(missingDataOf(...))` trước `judgePool`/ghi ⟹ không ghi, không audit (integration `subscription-foreign-price` dòng 72-82 kiểm cả hàng lẫn audit). DTO PATCH không cho null số lượng/giá/chu kỳ/ngày bắt đầu (`subscription.dto.ts:58-74`) nên thực tế chỉ giá cũ ngoại tệ (hoặc dữ liệu cũ thiếu chu kỳ) chạm nhánh này.
- Wire: `SUBSCRIPTION.STILL_DRAFT` đã có ở `subscription.http-errors.ts:86-87,163`, ví dụ PATCH `subscriptions.controller.ts:83`, bảng mã `test/support/openapi-example-route-codes-catalog.ts` (`subscriptionUpdate`) và `openapi.json` (đã sinh lại ở `6fedbc67`, chuỗi "never lowered to a draft" có mặt). Mô tả không chứa "QĐ-".
- Kiến trúc: không thêm file; `subscription/` vẫn 25 file.
- Còn lại: FY1-03 (đường đọc giá theo thuê bao đi vòng), FY1-08 (mô tả 422 hẹp hơn luật).

## (d) `fc272d94` C-R1 + migration `20261113004000_ct1_plan_enters_k4_without_terms` — ĐÃ SỬA ĐÚNG

- SQL: bốn nhánh cũ giống từng dòng với `20261113003800_ct1_plan_keeps_perpetual/migration.sql:9-44`; nhánh mới (dòng 40-45) chỉ chạy khi `provisioning_type` đổi **và** mới là `K4` **và** có thuê bao `kind = 'TERM'` (mọi trạng thái, đúng D-48). Các chiều: K1/K2/K3/K5 → K4 có TERM ⟹ chặn; K4 → khác ⟹ không chạm nhánh mới (nhánh cũ lo); K4 → K4 (đổi tên) ⟹ trigger `BEFORE UPDATE OF pricing_model, provisioning_type` (`20261022110000…/migration.sql:65-67`) với `IS DISTINCT FROM` ⟹ không chặn. Khi K1/K2 → K4, `pricingModelOf` (`plan.service.ts:236-243`) suy `NULL` nên nhánh `ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY` không bắn trước; reason ra đúng `TERM_SUBSCRIPTIONS`.
- Ánh xạ lỗi: `changeBlockOf` (`plan.service.ts:287-292`) so khớp chuỗi `plan_change_blocked: ${reason}` có tiền tố ⟹ `SUBSCRIPTIONS` không ăn nhầm `TERM_SUBSCRIPTIONS`/`PERPETUAL_SUBSCRIPTIONS`.
- Dữ liệu cũ: `CREATE OR REPLACE FUNCTION` không quét hàng ⟹ deploy không fail dù có gói K4 + TERM cũ (xem FY1-05). Chạy lại an toàn.
- Race: mọi đường ghi thuê bao khóa plan trước khi đọc kiểu cấp (`subscription.service.ts:173,253` `lockExclusive`; `subscription-change.service.ts:96-97`; `subscription-period.service.ts:132` `lockShared`) — đổi plan lấy khóa hàng `FOR UPDATE` nên hai bên tuần tự hóa; ở READ COMMITTED câu `EXISTS` trong plpgsql lấy snapshot mới sau khi chờ khóa.
- Số migration `…004000` > `…003900` > mọi migration của hai nhánh. Wire: lý do mới có trong `CONFLICT_DESCRIPTION` và `openapi.json` (2 lần), `details` 409 không có enum nên không phải sửa schema.
- Thiếu: FY1-04 (test chưa chặt), FY1-05 (dữ liệu K4+TERM cũ không được báo).

## (e) C-R2 `af7d45e9`, C-R3 `63e1365d`, catalog trong `61e910fc`

- D-32: gạch "có ⟹ giữ" và "Không ép K4 ⟹ PERPETUAL", thêm dòng cập nhật đúng `assertPricingModelDerived` (`plan.policy.ts:89-93`: gửi khác giá trị suy ⟹ 422 kể cả `FLAT_RATE` cũ) và `assertTermOfKind` (`subscription-pool.policy.ts:55-56`).
- D-33(1): ghi đúng `pg_advisory_xact_lock(hashtextextended('application-duplicate:<org>', 0))` (`application.repo.ts:101`) chạy trước `duplicateCandidates` (`application-intake.service.ts:71-72`).
- D-36: có file/commit `c2b15c32`, `…003800`, `…004000`, FE cần biết hai mã 422 + `details.expected`. D-48 đầy đủ câu hỏi/phương án/đã chọn/căn cứ/đổi lại/FE cần biết.
- Module card catalog/installation: mọi dòng thêm đã đối chiếu code (xem bảng tóm tắt). `PUBLIC_ROOT_POLICY_FILES` không kiểm lại (C-audit đã xác nhận).
- `61e910fc`: assertion dời nguyên, không nới.

---

## Finding mới

### FY1-01 · Required · Flow nightly `mf1-group-request` "nhà thầu được cấp quyền" sẽ đỏ vì NV-CTR1 nay có hợp đồng hết sau 20 ngày

- **Chỗ (47fb5097):** `test/flows/mf1-group-request.flow-spec.ts:143-180` (assert `expected_end_date: end` với `end = oneMonthTerm()` dòng 19-25, 147, 179);
  nguyên nhân `src/cli/seed/fixture/shared-demo-v4/organization.ts:107` (`contractEndInDays: 20`, thêm ở `3ce3328b`) + `organization.steps.ts` gửi `contractEndDate`.
- **Kịch bản:** flow dựng world từ seed `shared-demo-v4` ⟹ NV-CTR1 có `contract_end_date = hôm nay + 20`. Trưởng phòng gửi nhóm Figma `termMonths: 1` cho NV-CTR1 + NV-DEV1. `GroupSubmissionFactsService` (`group-request-submission/group-submission-facts.service.ts:183-191`) tính `termRunOf({ months: 1, contractEndDate })` ⟹ `derived = hôm nay + 1 tháng − 1` > `contractEndDate` ⟹ cắt ở hôm nay + 20. Assignment của nhà thầu mang `expected_end_date = hôm nay + 20`, test chờ `hôm nay + 1 tháng − 1` (luôn ≥ 27 ngày) ⟹ `toEqual` đỏ mọi ngày chạy.
- **Căn cứ:** `QĐ-111i`/R-38 (người có thời hạn bị cắt ở ngày hết hợp đồng) — hành vi code đúng, test cũ viết khi NV-CTR1 chưa có ngày hết hợp đồng. Memory Owner "Full CI before done": job `flows` của `nightly.yml:80-105` thuộc CI.
- **Cách sửa (chọn một, khuyến nghị A):** (A) sửa test cho đúng luật mới: đọc `contract_end_date` của NV-CTR1 và assert nhà thầu = `LEAST(oneMonthTerm, contract_end_date)` (tức ngày hết hợp đồng), thêm assert NV-DEV1 = `oneMonthTerm` (vẫn giữ ý R1 cho người không bị cắt); đổi tên ca thành "…cắt ở ngày hết hợp đồng (R-38)". (B) giữ test, đổi fixture: cho nhà thầu khác (không có hợp đồng ghi sẵn) vào ca này. Ghi bổ sung vào D-45 rằng các flow dùng NV-CTR1 đã rà.
- **Test/mutation:** sau sửa A, mutation `contractEndInDays: 20` ⟹ `contractEndInDays: 400` phải làm ca đỏ (ngày không còn bị cắt).

### FY1-02 · Required (ngoài commit FIX, rủi ro CI) · Flow nightly `mf4-budget` gửi Request `K1` 12 tháng ⟹ 422

- **Chỗ:** `test/flows/mf4-budget.flow-spec.ts:212-215` (`submitRequest('NV-DEV2', chatgpt, { termMonths: 12 })`, ChatGPT Plus là `K1`); luật `src/core/term-limit.ts:39,53-56` (`K1_TERM_LIMIT_MONTHS = 9`).
- **Kịch bản:** `POST /access-requests` trả 422 `ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE`; `flow-calls.ts:97-98` ném `submit answered 422` ⟹ ca F4-01b đỏ. Có từ RQ-2 (`c5c86612`), không phải do FIX-B1, nhưng FIX-B1 tuyên bố seed/flow theo hợp đồng mới mà chưa rà.
- **Căn cứ:** `QĐ-111i` (K1 1–9 tháng). D-45 chỉ nói 4 suite seed integration xanh, không nói flows.
- **Cách sửa:** đổi sang `termMonths: 9` (hoặc dùng gói K2 nếu ý ca là "12 tháng") và sửa tên ca; chạy `pnpm test:flows` sau seed.
- **Test:** chính ca này.

### FY1-03 · Optional · Đường đọc giá theo thuê bao vẫn trả giá USD chưa quy; D-46 nói "mọi đường đọc giá đi qua `subscription-priced.repo.ts`" là sai

- **Chỗ:** `src/modules/catalog/subscription/subscription-facts.service.ts:73-87` (`priceOfSubscription` đọc `record.unitPrice` bất kể tiền tệ) → `CatalogApi.getSubscriptionPrice` (`public/catalog.api.ts:178-180`) → `licensing/shared-pool/shared-pool.service.ts:197-201` → `shared-pool.policy.ts:75` (`reportingUnitPrice ?? unitPrice`); `OVERNIGHT-DECISIONS.md:495`.
- **Kịch bản:** thuê bao K2 `ACTIVE` còn 20 USD, không snapshot (migration FX-1 không quy được). IT cấp từ kho ⟹ "chi phí tránh được" ghi `amountMinor` theo USD, `currency = 'USD'` — một số tiền ngoại tệ mới sinh trong luồng mới, trái bất biến SPEC §8 mà B1A-03 đóng ở nguồn giá gói. (Baseline ngân sách an toàn vì chỉ đọc `unitPriceReportingMinor`.) Ngoài ra màn chi tiết thuê bao vẫn hiện `ACTIVE` + `missing: ['UNIT_PRICE']` (ý (2) của B1A-03) — chấp nhận được vì PATCH nay buộc nhập lại giá.
- **Cách sửa:** trong `priceOfSubscription` trả `null` khi `!isPricedInDong(record)` (cùng hàm của `missingData`), hoặc `avoidedCostOf` bỏ qua khi `currency !== DONG`; sửa câu D-46 thành "nguồn giá của gói đi qua đây; giá theo một thuê bao (`getSubscriptionPrice`) lọc ở …".
- **Test:** unit `shared-pool.policy.spec` (giá USD không snapshot ⟹ `null`) hoặc thêm ca vào `subscription-foreign-price.integration-spec.ts`: `CatalogApi.getSubscriptionPrice(id)` ⟹ `null`.

### FY1-04 · Optional · Test C-R1 chưa chặt: SQL thô chỉ kiểm mã 23514, không kiểm tên ràng buộc; chỉ phủ K1 → K4

- **Chỗ:** `test/integration/catalog/catalog-licensing-write-integrity.integration-spec.ts:449-461` (`sqlState(...)).toBe('23514')`; `sqlState` dòng 16 chỉ trả `code`).
- **Kịch bản:** một CHECK 23514 khác (ví dụ ai đó siết lại `plans_pricing_model_by_kind`, hoặc trigger plan-terms) bắn trước thì ca SQL thô vẫn xanh dù nhánh `plans_change_keeps_terms` bị xóa (ca HTTP thì vẫn bắt được do reason). Kịch bản gốc của C-R1 là K2 Slack có hồ sơ workspace — chưa có ca K2.
- **Cách sửa:** assert `constraint === 'plans_change_keeps_terms'` (đọc `error.constraint` của `pg`); thêm ca K2 có thuê bao TERM + hồ sơ workspace ⟹ 409 `TERM_SUBSCRIPTIONS`, hồ sơ còn nguyên.

### FY1-05 · Optional · Gói K4 + thuê bao TERM có từ trước CT-1 không được báo lúc deploy

- **Chỗ:** `prisma/migrations/20261113004000_ct1_plan_enters_k4_without_terms/migration.sql` (không có `RAISE NOTICE`/đếm); hệ quả ở `subscription-period.service.ts:203` (`assertPoolTerms` ⟹ `K4_PERPETUAL_ONLY` khi gia hạn).
- **Kịch bản:** dữ liệu thật trước CT-1 có thể có K4 `TERM` hợp lệ lúc đó; sau deploy chúng không gia hạn được và mọi PATCH chạm kỳ hạn 422, không ai được báo. Migration không fail (đúng), nhưng Ops không biết có hàng cần xử lý.
- **Cách sửa:** thêm một `DO $$ … RAISE NOTICE 'K4 plans with TERM subscriptions: %', n` vào migration mới kế tiếp (không sửa migration đã commit), hoặc một dòng trong `ops:preflight`/HANDOFF liệt kê truy vấn kiểm.

### FY1-06 · Optional · D-48 chặn cả thuê bao TERM đã hết/huỷ nhưng không có đường thoát

- **Chỗ:** migration `…004000:40-42` (không lọc `status`); D-48 "FE cần biết" ghi "không có đường xóa… tạo gói K4 mới".
- **Kịch bản:** gói từng có một thuê bao TERM đã `ENDED` vĩnh viễn không thể thành K4. Đúng chủ ý "đơn giản và an toàn", nhưng là quyết định nghiệp vụ Owner cần thấy (C-O6). Giữ nguyên; chỉ cần Owner xác nhận khi duyệt sổ D-n.

### FY1-07 · Nit · Commit message merge nói "module-graph.md (sinh lại)" nhưng file merge giống hệt ^1

- **Chỗ:** `0f3d07d8` message; `git diff 0f3d07d8^1 0f3d07d8 -- docs/generated/module-graph.md` rỗng.
- Không sai về nội dung (phía mf2 không đổi `src/modules/**`, nên đồ thị của ^1 đúng; `30dd2543`/`6fedbc67` sinh lại sau). Chỉ ghi lại để ai đọc lịch sử không tưởng đã chạy generator lúc merge.

### FY1-08 · Nit · Mô tả 422 của `PATCH /subscriptions/{id}` hẹp hơn luật

- **Chỗ:** `src/modules/catalog/subscription/subscriptions.controller.ts:44-45` ("details.missing is UNIT_PRICE"); luật thật ở `subscription-change.service.ts:152-163` là tổng quát (D-46: "PATCH không bao giờ đưa ACTIVE về DRAFT"), một hàng `ACTIVE` cũ thiếu `billing_cycle` cũng nhận `missing: ['BILLING_CYCLE']`.
- **Cách sửa:** "… refused with SUBSCRIPTION.STILL_DRAFT naming what is missing (details.missing; for a price left in another currency, UNIT_PRICE) …".

---

## Rà D-n

| D-n | Kết luận |
| --- | --- |
| D-32 | Khớp code sau `af7d45e9`. |
| D-33 | Khớp code (khóa advisory trước kiểm trùng). |
| D-36 | Khớp code; FE cần biết đầy đủ. |
| D-45 | Đúng phần seed; thiếu rà flows dùng seed (FY1-01, FY1-02); câu "4 suite seed integration xanh" chưa kiểm được ở đây. |
| D-46 | Đúng hướng; câu "mọi đường đọc giá" sai (FY1-03). |
| D-48 | Khớp code và migration; quyết định chặn cả TERM đã hết cần Owner thấy (FY1-06). |

## Test cũ bị nới / dự đoán CI

- Không thấy assertion bị nới ở `3ce3328b`, `21914df6`, `fc272d94`, `61e910fc` (phần catalog). Các assertion bị thay ở `shared-demo-v4.spec.ts` là hành vi đã bỏ theo `QĐ-111an`/`QĐ-111i`, thay bằng assertion tương đương.
- Dự đoán đỏ (đọc tĩnh): nightly `flows` — `mf1-group-request` ca nhà thầu (FY1-01), `mf4-budget` F4-01b (FY1-02). Dự đoán xanh: unit seed (`shared-demo-v4.spec`, `seed-steps.spec`, `catalog.steps.spec`, `organization.steps.spec`, `request.steps.spec`), integration `subscription-foreign-price`, `catalog-licensing-write-integrity`, `year-start-commitments` (ca USD vẫn ra `NO_PRICE` vì giá gói nay `null`), `subscription-purchase-and-drafts-http` (ca USD là bản nháp, không chạm `statusAfter`).

## Mutation đề xuất

| File | Chuỗi cũ | Chuỗi mới | Lệnh test |
| --- | --- | --- | --- |
| `src/modules/catalog/subscription/subscription-priced.repo.ts:18` | `unitPriceCurrency: DONG,` | `unitPriceCurrency: { not: null },` | `pnpm test:integration -- test/integration/catalog/subscription-foreign-price.integration-spec.ts` |
| `src/modules/catalog/subscription/subscription-priced.repo.ts:38` | `unitPriceCurrency: DONG,` | `unitPriceCurrency: { not: null },` | như trên (ca `priceOf(planId, '2026-06-01')` phải đỏ) |
| `src/modules/catalog/subscription/subscription-change.service.ts:158` | `if (current.status === 'ACTIVE' && status === 'DRAFT') {` | `if (false) {` | như trên (ca 422 `STILL_DRAFT` phải đỏ) |
| `prisma/migrations/20261113004000_ct1_plan_enters_k4_without_terms/migration.sql:42` | `s."kind" = 'TERM'` | `s."kind" = 'PERPETUAL'` | `pnpm test:integration -- test/integration/catalog/catalog-licensing-write-integrity.integration-spec.ts` (DB tạo lại) |
| `src/modules/catalog/plan/plan.service.ts:283` | `'TERM_SUBSCRIPTIONS',` | (xóa dòng) | như trên (409 thành 422 `PROVISIONING_TYPE_MISMATCH`) |
| `src/cli/seed/fixture/shared-demo-v4/organization.ts:107` | `contractEndInDays: 20` | `contractEndInDays: 400` | `pnpm test -- src/cli/seed/fixture/shared-demo-v4.spec.ts` (và sau FY1-01: `pnpm test:flows`) |
