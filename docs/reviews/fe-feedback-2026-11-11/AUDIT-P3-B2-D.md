# AUDIT P3 · B2-D — gói CO-1 (hợp đồng)

- **Phạm vi:** `112beab6` (migration `20261113004200` + policy), `1eaa5948` (list/PATCH/link/unlink/detail), `54487e74` (sinh lại),
  `6b11ea70` (HANDOFF, OVERNIGHT-DECISIONS: D-62, CO-1-Q1/Q2, CO-1-O1…O6). Mọi `file:dòng` đọc ở `6b11ea70` qua `git show`.
- **Cách làm:** chỉ đọc (không chạy pnpm/jest/docker, không đụng working tree). Reviewer: Claude Opus, 15/11/2026.
- **Skill:** `agent-skills:code-review-and-quality` (năm trục, nhãn mức), `superpowers:verification-before-completion` (mọi kết luận có
  dòng code hoặc dòng tài liệu làm bằng).
- **Nguồn đối chiếu:** `QĐ-101k`, `QĐ-111t` (`Docs/Decisions/project-decisions.md:301,321`), BRD `FR-1.13` (BRD dòng 405, 452),
  `US-04-13` AC-1…AC-15 (`Docs/BE-UserStory/src/EP-04.md`), `Quy trình và chính sách theo main flow.md:1113`, `SBF-20` bước 1,
  SPEC §5 CO-1 + D8/D9, F3 FB-5-1…FB-5-8, `docs/rules/module-structure.md`, `docs/rules/database-business.md`.

## Tóm tắt

| Mức      | Số | Mã                                       |
| -------- | -- | ---------------------------------------- |
| Critical | 0  | —                                        |
| Required | 1  | B2D-01                                   |
| Optional | 3  | B2D-02, B2D-03, B2D-04                   |
| Nit      | 5  | B2D-05, B2D-06, B2D-07, B2D-08, B2D-09   |

**Đánh giá D-62 / Chờ Owner:**

- **CO-1-Q1 (POST bắt buộc `vendorId` + `effectiveFrom`)** — **đúng tài liệu, giữ A.** `QĐ-101k` chỉ cho *hiệu lực đến* "có thể trống"
  và nhà cung cấp "bắt buộc với hợp đồng mới"; trạng thái *chưa đủ thông tin* được tài liệu gắn riêng cho "hợp đồng cũ" (US-04-13 Dữ liệu
  nghiệp vụ, AC-5). Cho trống ngày bắt đầu (B) sẽ tạo hợp đồng mới `INCOMPLETE`, trái nghĩa đó. Không nhận `kind`: đúng `QĐ-111t`.
- **CO-1-Q2 (PATCH sửa được `name`)** — **đúng tài liệu, giữ A.** `QĐ-101k`: IT Admin "sửa (bất kỳ lúc nào, bắt buộc lý do, Audit
  Trail trước/sau)", ràng buộc duy nhất là không đổi nhà cung cấp khi đã có thuê bao liên kết; tên là trường của hợp đồng (US-04-13).
- Lệch HANDOFF: dòng CO-1.2 ghi `contracts.integration-spec` phủ "AC-1…AC-15", nhưng AC-15 với Finance không thực hiện được (B2D-01).

## Findings

### B2D-01 · Required — Finance không thấy nguồn usage của ứng dụng ở chi tiết hợp đồng (AC-15)

- **Ở đâu:** `src/modules/catalog/contract/contract.dto.ts:168-171` (`applicationIds` "Read their usage sources from the usage sources
  of the application"), `src/modules/catalog/contract/contracts.controller.ts:124-131` (`GET /contracts/{id}` cho `IT_ADMIN`,
  `FINANCE`); chặn ở `src/modules/usage/vendor-source/vendor-source.controller.ts:81` (`@RequireRoles('IT_ADMIN')` mức class, phủ cả
  `GET /usage-sources` dòng 111 và `GET /usage-sources/{id}` dòng 135).
- **Kịch bản:** Finance mở `GET /contracts/{HD-2026-07}` → nhận `applicationIds: [jira]` → FE gọi `GET /usage-sources?applicationId=jira`
  như SPEC §5 CO-1 hướng dẫn → **403 `AUTHORIZATION.FORBIDDEN`**. Finance không có đường nào xem nguồn usage của hợp đồng.
- **Căn cứ:** US-04-13 AC-15: "**When** IT Admin **hoặc Finance** mở chi tiết `HD-2026-07`, **Then** thấy nguồn usage của ứng dụng Jira
  Cloud (tên nguồn, trạng thái) đọc qua thuê bao liên kết"; Persona "Finance (chỉ xem)… danh sách, chi tiết, thuê bao của hợp đồng";
  `QĐ-111t` "chi tiết hợp đồng hiện nguồn usage của ứng dụng". Lỗ này có từ SPEC (dòng `GET /contracts/{id}`), Sonnet làm đúng SPEC nhưng
  SPEC trái AC-15 cho Finance. Thêm: wire của nguồn usage (`vendor-source.controller.ts:56-73`) không có trường *trạng thái* AC-15 nêu.
- **Cách sửa (Owner chọn):**
  - **A (gọn nhất):** chuyển `@RequireRoles` của `UsageSourceController` từ class xuống method: `GET` list và `GET :id` nhận
    `IT_ADMIN`, `FINANCE`; `POST`/`PATCH` giữ `IT_ADMIN`. Wire hiện không có bí mật (chỉ cấu hình mẫu báo cáo), nhưng Finance sẽ thấy
    **mọi** nguồn, không chỉ của hợp đồng; mô tả OpenAPI dòng 77-78 ("Only the IT Admin") phải sửa.
  - **B (hẹp, đúng chữ "đọc qua thuê bao liên kết"):** route mới ở module `usage` (T6 được đọc catalog qua facade) `GET
    /contracts/{id}/usage-sources` cho `IT_ADMIN`, `FINANCE`, lấy `applicationIds` của hợp đồng qua `CatalogApi`, trả dòng tóm tắt
    `{ id, name, application { id, name }, status }` (≤ 100, `truncated`). Không cần đổi quyền route cũ.
  - Đề xuất **B** nếu Owner muốn Finance chỉ thấy phần của hợp đồng; **A** nếu Finance được xem nguồn usage nói chung. Cả hai cần
    quyết định "trạng thái" của nguồn là gì (lần nhập gần nhất / kết nối) — hiện không có trường đó.
- **Test nên thêm:** integration: Finance `GET` chi tiết hợp đồng Atlassian rồi đọc nguồn usage của Jira Cloud ⟹ 200 và thấy tên nguồn;
  Finance `POST /usage-sources` ⟹ 403; trưởng phòng đọc ⟹ 403 (`SoD-2`, `QĐ-101i`). Đột biến: bỏ `FINANCE` khỏi route đọc ⟹ đỏ.

### B2D-02 · Optional (A/B) — Kỳ gia hạn không mang liên kết hợp đồng

- **Ở đâu:** `src/modules/catalog/subscription/subscription-period.service.ts:121-158` (`recordNext`): kỳ mới mang
  `commitmentTermMonths`, `responsibleItAdminEmployeeId`, `vendorMinimumSeats` (dòng 137-142) nhưng **không** tạo dòng
  `contract_subscriptions`; `contract-subscription.repo.ts` không có đường nào khác.
- **Kịch bản:** hợp đồng khung Atlassian 2026–2028 (AC-1) liên kết thuê bao Jira kỳ 2026. Kỳ 2027 được ghi qua gia hạn ⟹ dòng
  `subscriptions` mới không có hợp đồng; chi tiết hợp đồng chỉ còn kỳ 2026, Finance tra "thuê bao nào dựa trên văn bản nào" cho kỳ 2027
  thấy trống tới khi IT nhớ liên kết tay.
- **Căn cứ:** không trái tài liệu — AC-2 mô tả IT "liên kết thuê bao kỳ 2027" vào hợp đồng mới (tay). Nhưng Business value US-04-13 và
  BRD dòng 405 ("một hợp đồng khung nhiều năm chứa được nhiều kỳ gia hạn", "kéo nhiều năm") gợi ý kỳ kế tiếp nên giữ hợp đồng khi hợp
  đồng còn hiệu lực vào ngày bắt đầu kỳ mới.
- **A:** giữ liên kết tay (như hiện tại); thêm cờ *kỳ chưa có hợp đồng* ở danh sách thuê bao (CO-1-O4). **B:** `recordNext` gọi
  `ContractSubscriptionService` (qua một hàm `carryTo(tx, previousId, nextId)`) mang liên kết khi `contractStatusOf(contract, startDate)
  === 'ACTIVE'`, có audit `CONTRACT.SUBSCRIPTION_LINKED` actor là người ghi gia hạn. Đề xuất hỏi Owner; B tốn ít (một hàm, một test).
- **Test (nếu B):** integration gia hạn kỳ trong hiệu lực hợp đồng ⟹ kỳ mới có trong `subscriptions[]`; ngày bắt đầu sau `effectiveTo`
  ⟹ không mang.

### B2D-03 · Optional (A/B) — Liên kết không xét ngày: hợp đồng hết hiệu lực, chưa hiệu lực, hay kỳ thuê bao nằm ngoài hiệu lực

- **Ở đâu:** `src/modules/catalog/contract/contract-fields.policy.ts:162-172` (`assertSubscriptionLinkable` chỉ xét kiểu cấp, có nhà
  cung cấp, cùng nhà cung cấp); `contract-subscription.service.ts:47-58`.
- **Kịch bản:** hợp đồng Figma 2026 (`EXPIRED` từ 01/01/2027) vẫn nhận thuê bao kỳ 2027 ⟹ 201, trái tinh thần AC-2 ("hợp đồng mới cho kỳ
  2027"). Tương tự hợp đồng có nhà cung cấp mà chưa có ngày bắt đầu (`INCOMPLETE`) vẫn nhận liên kết (xem B2D-09).
- **Căn cứ:** tài liệu không nói rõ ⟹ thiết kế. **A:** giữ (IT tự chịu), chỉ hiện cảnh báo ở FE. **B:** từ chối 422
  `CONTRACT.NOT_IN_EFFECT_FOR_PERIOD` khi kỳ thuê bao `[startDate, endDate]` không giao `[effectiveFrom, effectiveTo]`. Đề xuất A (đơn
  giản, theo memory "simple fields") nhưng hỏi Owner vì sau này đổi B là đổi hợp đồng FE.

### B2D-04 · Optional — Bỏ liên kết không cần lý do, và mở đường đổi nhà cung cấp

- **Ở đâu:** `src/modules/catalog/contract/contract-subscription.service.ts:81-108` (`unlink` không nhận `reason`, audit `before:
  { subscriptionId }`), `contract.dto.ts:88` (param, không body).
- **Kịch bản:** IT gỡ hết thuê bao (không lý do) rồi `PATCH vendorId` (có lý do) — khóa nhà cung cấp AC-8 bị đi vòng; Audit Trail không
  có vì sao thuê bao rời hợp đồng. Test `contracts.integration-spec.ts:284-297` ghim đúng đường vòng này là hợp lệ.
- **Căn cứ:** route gỡ chỉ có ở SPEC, không có ở US/QĐ; AC-8 "sửa không có lý do ⟹ từ chối" áp cho sửa hợp đồng. Gỡ liên kết là thay đổi
  dữ liệu hợp đồng nên đòi lý do là nhất quán. **Sửa:** body `{ reason }` bắt buộc cho `DELETE` (hoặc đổi thành `POST
  /contracts/{id}/subscriptions/{sid}/unlink` nếu quy ước không cho body ở DELETE), `cleanChangeReason`, audit `after: { reason }`.
- **Test:** gỡ không lý do ⟹ 422 `CONTRACT.REASON_REQUIRED`; có lý do ⟹ audit có `reason`.

### B2D-05 · Nit — Số hợp đồng chỉ gồm dấu kết hợp ⟹ 500

- **Ở đâu:** `contract-fields.policy.ts:81-85,109` (`trimmedOrNull` giữ chuỗi) → `contract.repo.ts:108` (`numberKeyOf` = `searchKey`
  bỏ `\p{M}` ⟹ `''`) → CHECK `contracts_number_given` `length("number_key") > 0` (migration dòng 133-136) ⟹ 23514 không được
  `toContractApiException` ánh xạ ⟹ 500.
- **Kịch bản:** `POST /contracts { …, number: "́" }` (hoặc dán ký tự dấu rời).
- **Sửa:** trong policy, `numberKeyOf(number) === ''` ⟹ coi như `null` hoặc 422 `VALIDATION_ERROR`; test HTTP ca này ⟹ 422.

### B2D-06 · Nit — Chốt CSDL của liên kết chưa kín như chú thích nói

- **Ở đâu:** migration `20261113004200…/migration.sql:91-94` (trigger `contract_subscriptions_check` chỉ `BEFORE INSERT`) và dòng 10-12
  ("this is the last word when two requests meet").
- **Kịch bản:** `UPDATE contract_subscriptions SET contract_id = <hợp đồng khác nhà cung cấp>` không bị kiểm. Về đua: FK
  `contract_subscriptions → contracts` chỉ lấy `FOR KEY SHARE`, không xung đột với `UPDATE contracts SET vendor_id` (khóa `FOR NO KEY
  UPDATE`), nên nếu không có `ContractRepo.lock` của tầng app thì guard và trigger đọc ảnh chụp cũ của nhau và cả hai cùng qua. Hôm nay
  an toàn vì cả `link`, `unlink`, `update` đều khóa dòng hợp đồng (`contract.repo.ts:181-186`).
- **Sửa:** migration sau đổi trigger thành `BEFORE INSERT OR UPDATE`, sửa chú thích dòng 11-12 thành "cùng với khóa dòng hợp đồng của
  app". Không gấp.

### B2D-07 · Nit — `effectiveOn` trả cả hợp đồng `INCOMPLETE`

- **Ở đâu:** `contract.repo.ts:143-146` (không có `vendorId: { not: null }`, khác `statusWhere('ACTIVE')` dòng 122-127).
- **Kịch bản:** hợp đồng cũ được bổ sung ngày nhưng chưa nhà cung cấp (PATCH chỉ `effectiveFrom`) ⟹ lọc `effectiveOn` coi là "đang hiệu
  lực" trong khi dòng đó hiện `status: INCOMPLETE`.
- **Sửa:** thêm `vendorId: { not: null }` vào vế `effectiveOn`, hoặc ghi rõ ở mô tả OpenAPI. Test: hợp đồng có ngày, không nhà cung cấp,
  lọc `effectiveOn` ⟹ không có.

### B2D-08 · Nit — Chi tiết đọc không cùng ảnh chụp; `truncated.subscriptions` từ một câu khác

- **Ở đâu:** `contract-query.service.ts:73-93`: `findDetail` (có `_count`) và `briefsOf`/`attachedTo`/`applicationIdsOf` là bốn câu rời,
  ngoài transaction; `truncated.subscriptions` = `subscriptionCount > 100` (câu 1) còn mảng từ câu 2.
- **Kịch bản:** liên kết/gỡ chen giữa ⟹ `subscriptionCount` và `subscriptions.length`/`truncated` lệch nhau trong cùng một trả lời.
- **Sửa:** gói bốn câu trong `RepeatableRead` như `list` (`contract.repo.ts:204-230`), hoặc lấy `briefsOf(id, 101)` rồi cắt như hai mảng
  kia.

### B2D-09 · Nit — `CONTRACT.INCOMPLETE` khi liên kết chỉ xét nhà cung cấp

- **Ở đâu:** `contract-fields.policy.ts:170` (`contractVendorId === null`), trong khi `contractStatusOf` dòng 68 gọi `INCOMPLETE` cả khi
  thiếu `effectiveFrom`.
- **Kịch bản:** hợp đồng hiện `status: INCOMPLETE` (có nhà cung cấp, chưa ngày bắt đầu) vẫn nhận liên kết 201; FE đọc mã lỗi tên
  `INCOMPLETE` sẽ hiểu nhầm luật.
- **Sửa:** hoặc từ chối mọi hợp đồng `INCOMPLETE` (dùng `contractStatusOf`), hoặc đổi tên mã/mô tả thành "chưa có nhà cung cấp". Gộp
  quyết định với B2D-03.

## Phần đúng đã kiểm

- **Nghiệp vụ:** không ô loại, `effectiveTo` trống = vô thời hạn và luôn `ACTIVE` sau ngày bắt đầu, ngày cuối vẫn `ACTIVE`
  (`contract-fields.policy.ts:64-73`) — đúng AC-3, AC-12; số tùy chọn, duy nhất sau chuẩn hóa (`@@unique([organizationId, numberKey])`,
  NULL không trùng) — AC-4; nhà cung cấp bắt buộc khi tạo, hợp đồng cũ `INCOMPLETE` tới khi bổ sung có lý do — AC-5; chỉ `K2`/`K4`,
  cùng nhà cung cấp, tối đa một hợp đồng (unique `subscription_id` + trigger) — AC-6, AC-7, AC-14 (ứng dụng nội bộ không có nhà cung
  cấp ⟹ mismatch); PATCH lý do bắt buộc, audit trước/sau + lý do, khóa nhà cung cấp khi còn liên kết — AC-8; không route xóa, trigger
  cấm `DELETE` — AC-9; danh sách tìm/lọc/sắp xếp/phân trang — AC-10; Finance chỉ đọc, trưởng phòng/Employee 403 — AC-11, AC-13 (`SoD-2`);
  audit `CONTRACT.CREATED` ghi người tạo — AC-1. Không có ngày gia hạn/hạn báo hủy/điều khoản trên hợp đồng — đúng `ADR-06`, `QĐ-101k`
  (kỳ cam kết/chu kỳ trả tiền `QĐ-104d` và điểm điều chỉnh `QĐ-103e` ở thuê bao, không lặp).
- **Đúng đắn:** `update` khóa `FOR UPDATE` trước khi đọc/ghi (`contract.service.ts:113`), `link`/`unlink` cùng khóa dòng hợp đồng
  (`contract-subscription.service.ts:47,90`) ⟹ đổi nhà cung cấp và liên kết xếp hàng; trùng số: kiểm trước + bắt `P2002 number_key`;
  hai liên kết một thuê bao: unique + bắt `P2002 subscription_id` trả 409 kèm `contractId` (có test đua dòng 389); PATCH không đổi gì
  không ghi audit; `list` đếm và trang cùng `RepeatableRead`, thứ tự ổn định (`effectiveFrom NULLS LAST, name, id`); `_count` không N+1
  (test đếm câu lệnh 3 vs 30); trạng thái tính theo `businessToday` của tổ chức, bộ lọc `status` cùng bốn vế với mapper (test so khớp).
- **Kiến trúc:** chỉ đọc bảng của `catalog` (subscriptions/plans/applications cùng module), `organization`/`audit` qua `public/`; không
  đọc `usage` (T6) từ catalog (T4); `contract/` 20 file ≤ 25; capability import nhau không vòng (cho phép ở `module-structure.md:69`);
  `ContractSubscription` vào `PRISMA_MODEL_OWNER`; README module cập nhật bảng sở hữu.
- **Wire/OpenAPI:** `@RequireRoles` đúng từng route (list/get `IT_ADMIN`,`FINANCE`; create/patch/link/unlink `IT_ADMIN`); 14 mã
  `CONTRACT.*` mới đều có trong `openapi.json` và `contract.http-errors.ts`, ví dụ sinh từ mapper; 0 chuỗi `QĐ` trong `openapi.json`;
  `strictObject` từ chối `kind`; mảng lồng `maxItems` 100 + `truncated` (D9).
- **Migration `20261113004200`:** chỉ expand — cột mới nullable, không drop cột/bảng/dữ liệu (chỉ thay trigger `contracts_immutable` và
  hàm `contract_reject_change`); CHECK mới đều qua với hàng cũ (toàn NULL); unique mới trên `number_key` không thể trùng ở dữ liệu cũ (cột
  mới toàn NULL) ⟹ deploy không vỡ; `updated_at` NOT NULL có DEFAULT và chỉ backfill khi cột mới được thêm; trigger cũ bị bỏ **trước**
  câu `UPDATE` duy nhất; chạy lại an toàn (`IF NOT EXISTS`, `DROP … IF EXISTS` trước `ADD`/`CREATE TRIGGER`); không nêu tên vai, bảng
  mới cần DML thường nên không vào `RUNTIME_TABLE_EXCEPTIONS`. Test chạy hai lần + `migrate diff` = 0.
- **Test/seed/flows:** không thấy `skip`/`only`/nới assertion; ba test cũ đổi theo hành vi mới có lý do (PATCH nay tồn tại; trường lạ nay
  là `kind`; guard nay cho sửa trường nhưng không đổi người tạo). `src/cli`, `test/flows`, `test/e2e` không gọi API hợp đồng (grep 0) và
  `document-final-key-migration` chèn thô chỉ `name` vẫn hợp lệ ⟹ seed/flows không đỏ vì CO-1.

## Chưa chứng minh (ngoài khả năng đọc tĩnh)

- `Prisma contains` (`contract.repo.ts:138`) có thoát `%`/`_` hay không — dùng giống `vendor.repo.ts:77` và các repo khác; chưa có test
  `search=50%`. Nhánh bắt `P2002` cho `number_key` (đua hai lần tạo cùng số) chưa có test riêng.

## Mutation đề xuất

1. Bỏ `vendorId: { not: null }` ở `statusWhere('ACTIVE')` (`contract.repo.ts:124`) — cần một hợp đồng có ngày mà không nhà cung cấp
   trong suite để ca "status filter = mapper" đỏ; hiện hợp đồng cũ không có ngày nên đột biến có thể sống.
2. Bỏ `numberTaken` trước khi ghi (`contract.service.ts:66,126`) — chỉ còn nhánh `isUniqueViolation(…,'number_key')`; nếu ca 409 vẫn xanh
   thì nhánh bắt lỗi được chứng minh, nếu đỏ (500) thì needle sai.
3. Bỏ `this.contracts.lock` ở `link` (`contract-subscription.service.ts:47`, thay bằng `find`) — thêm test đua "PATCH đổi nhà cung cấp ‖
   liên kết" (hai transaction song song) phải đỏ; hiện không có test nào giết đột biến này.
4. Đổi `today > contract.effectiveTo` thành `>=` (`contract-fields.policy.ts:70`) ⟹ ngày cuối thành `EXPIRED`; phải có ca đúng ngày
   `effectiveTo` (unit và vế `gte` của bộ lọc, `contract.repo.ts:126`) đỏ — kiểm cả hai nơi cùng giết đột biến, không chỉ mapper.
5. (sau B2D-01) bỏ `FINANCE` khỏi route đọc nguồn usage ⟹ ca AC-15 Finance phải đỏ.
