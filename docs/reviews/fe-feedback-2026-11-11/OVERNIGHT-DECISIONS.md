# OVERNIGHT-DECISIONS — chạy đêm Prompt 3 (14/11/2026)

> Nhánh `feat/fe-feedback`. Chế độ đêm ([HANDOFF-CHAT §6](HANDOFF-CHAT.md)): Owner không trả lời; mọi điểm tự chốt dưới đây là **tạm chốt**,
> audit sẽ hỏi lại Owner từng điểm `D-n`. Mỗi mục: câu hỏi · phương án · đã chọn + căn cứ · file/commit · cách đổi lại.
> Thứ tự căn cứ: QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ. Không tự chốt điều trái QĐ.

## Quyết định

### D-1 — `originalPrice` ở dạng `{ amount, currency }` (chuỗi thập phân đơn vị lớn), không phải `{ amountMinor, currency }`

- **Câu hỏi:** SPEC §5 FX-1 viết `originalPrice?: { amountMinor, currency }`; ADR-0007 (§1, Accepted) cấm `amountMinor` trên dây: tiền trên dây luôn là chuỗi `{ "amount": "1200.00", "currency": "USD" }`.
- **Phương án:** (a) theo chữ SPEC `amountMinor`; (b) theo ADR-0007 và mọi ô tiền khác của API (`unitPrice`, `quote.unitPrice`).
- **Đã chọn:** (b). Căn cứ: ADR-0007 + nhất quán với mọi trường tiền hiện có (FE đọc một dạng duy nhất); "amountMinor" trong SPEC là tên cột DB. Cột DB vẫn là `original_unit_price_minor` (đơn vị nhỏ của chính tiền tệ gốc).
- **File/commit:** `catalog/subscription/subscription.dto.ts`, `requests/assessment/assessment.dto.ts` — `bf773874`, `cdc46045`.
- **Đổi lại:** đổi schema Zod `originalPrice` ở hai DTO + `subscription-pricing.service.ts#readOriginal` / `quote.service.ts#read`; không đụng migration.

### D-2 — Báo giá đánh giá cũng lưu giá gốc: thêm 2 cột `quote_original_*` ở `access_request_assessments`

- **Câu hỏi:** SPEC FX-1 nhận `originalPrice?` ở `PUT /access-requests/{id}/assessment` và bảo quy báo giá ngoại tệ cũ sang VND "giá gốc vào hai cột mới", nhưng SPEC §6 chỉ có hai cột ở `subscriptions`; báo giá nằm ở bảng khác.
- **Phương án:** (a) nhận `originalPrice` rồi bỏ đi (không lưu); (b) thêm cặp cột cùng dạng ở `access_request_assessments` (CHECK cùng có/cùng vắng, FK `currencies`); (c) gom giá gốc vào cột JSON.
- **Đã chọn:** (b). Căn cứ: R-44 cần giá gốc có cấu trúc để so khớp hóa đơn; (a) mất dữ liệu khi quy đổi, (c) không ràng buộc được. Cột nullable, expand-only, không drop.
- **File/commit:** `prisma/migrations/20261113002800_fx_original_price_columns`, `prisma/models/requests.prisma` — `15e770dd`.
- **Đổi lại:** thôi ghi/đọc cột (không cần drop); PI-1/RC-1 chỉ cần đọc `subscriptions.original_*` nên không phụ thuộc cặp cột này.

### D-3 — Phạm vi và cách quy đổi của migration `…002900_fx_prices_to_vnd`

- **Câu hỏi:** SPEC nói quy "thuê bao, Request chưa duyệt chi (+ dòng nhóm, hồ sơ bổ sung), báo giá" nhưng không định nghĩa "chưa duyệt chi", tỷ giá "gần nhất", và các bảng bất biến.
- **Phương án / đã chọn (mỗi điểm):** (1) _Request chưa duyệt chi_ = không có `budget_commitments` và không có `spend_decisions` `APPROVED` (đang chờ, bị từ chối, rút…); Request đã có cam kết giữ nguyên (cam kết/lần kiểm/hóa đơn không đụng, đúng SPEC). (2) _Thuê bao và báo giá đánh giá_ quy hết (là bảng giá, không phải tiền đã chốt). (3) _Tỷ giá_ = dòng `exchange_rates` mới nhất có `rate_date <= CURRENT_DATE` của chính tổ chức và tiền tệ; không có ⟹ không đổi + `RAISE NOTICE` liệt kê id (không đoán). (4) _Hồ sơ bổ sung_ (`request_supplements`, append-only bằng trigger): tắt đúng trigger `request_supplements_no_update_delete` trong một câu UPDATE rồi bật lại, cùng một giao dịch. (5) _Dòng nhóm_ (`access_request_line_amounts`) chỉ sinh cùng cam kết nên Request chưa duyệt chi không có dòng nào ⟹ không động. (6) `payment_schedule` là cột đã ngừng (trigger chặn giá trị mới, không ai đọc) ⟹ không đổi. (7) Làm tròn từng con số riêng (tổng và đơn giá có thể lệch vài đồng so với tổng từng phần; SPEC không đòi cân). (8) Audit: thuê bao `SUBSCRIPTION.UPDATED`; Request, báo giá, hồ sơ bổ sung `ACCESS_REQUEST.REPRICED` (đều `actor_kind = SYSTEM`).
- **Căn cứ:** SPEC §5 FX-1 + §6 + ADR-0007; (1) theo câu "Dòng đã quy đổi trước (cam kết, lần kiểm ngân sách, hóa đơn) không đụng"; không tự đổi luật bất biến nào ngoài (4) mà SPEC đòi chuyển hồ sơ bổ sung.
- **File/commit:** `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql`, `test/integration/catalog/fx-prices-to-vnd-migration.integration-spec.ts` — `15e770dd`.
- **Đổi lại:** migration chưa chạy trên DB thật ⟹ sửa tại chỗ được; sau khi chạy thì thêm migration mới (không sửa cũ). Khi Owner chạy trên DB thật: đọc `NOTICE`, đếm trước/sau bằng chính các điều kiện `WHERE` của migration.

### D-4 — Giá kỳ mới của Request tiếp tục thuê bao (renewal outcome) ở ngoại tệ ⟹ 409 `PERIOD_REFUSED`

- **Câu hỏi:** `POST` kết quả gia hạn (`licensing/subscription-renewal`) nhận `unitPrice` của kỳ mới qua `SubscriptionPeriodApi.recordNextPeriod` → `pricing.read`; sau FX-1.2 ngoại tệ không còn đọc được. SPEC chỉ nêu `POST/PATCH /subscriptions` và báo giá.
- **Phương án:** (a) để lỗi `SubscriptionPriceNotVndError` rơi ra 500 (licensing không import được lỗi nội bộ catalog); (b) `recordNext` đổi thành `SubscriptionPeriodRefusedError('PRICE_NOT_VND')` ⟹ licensing đã map sang `409 SUBSCRIPTION_RENEWAL.PERIOD_REFUSED` `details.reason`; (c) thêm lỗi 422 riêng ở licensing.
- **Đã chọn (tạm chốt, Owner xác nhận ở audit):** (b): không đổi contract mới, đi đúng đường refusal có sẵn, không chạm module licensing. Căn cứ: QĐ-111an (giá chỉ VND, mọi chỗ nhập giá gói), "đơn giản, dễ đổi lại". Có test integration (`subscription-renewal-pool-fields`: 409, `details.reason = PRICE_NOT_VND`, không ghi gì) và mô tả route `outcome` nêu lý do (`FX-1-R4`).
- **File/commit:** `catalog/subscription/subscription-period.service.ts`, `catalog/public/subscription-period.types.ts` — `bf773874`.
- **Đổi lại:** đổi nhánh `catch` ở `recordNext` (hoặc làm (c) ở gói FX-2 nếu Owner muốn 422).

### D-5 — Thuê bao nháp còn ở ngoại tệ (không quy được) = thiếu giá; bỏ `priceSnapshot` và `EXCHANGE_RATE` khỏi response

- **Câu hỏi:** SPEC nói "response bỏ `priceRate*`, `priceReporting*`". Còn bản nháp ngoại tệ không có tỷ giá (migration để nguyên) thì `missing`/`complete` xử lý sao; và `missing: EXCHANGE_RATE` còn nghĩa gì khi không còn tỷ giá.
- **Phương án:** (a) giữ `EXCHANGE_RATE` cho bản nháp cũ; (b) bản nháp cũ coi như chưa có giá hợp lệ ⟹ `missing: UNIT_PRICE`, `complete` ⟹ 422 `STILL_DRAFT` `{ missing: ['UNIT_PRICE'] }` tới khi nhập lại bằng VND; bỏ `EXCHANGE_RATE` khỏi enum.
- **Đã chọn:** (b), dựng `isPricedInDong` (giá VND + có snapshot). Căn cứ: S-1/D2 (không còn khái niệm tỷ giá trong luồng), đơn giản, FE chỉ cần một thông báo ("nhập lại giá bằng VND"). Toàn bộ `priceSnapshot` bỏ khỏi response (không chỉ `priceRate*`) vì snapshot đồng nhất không mang thông tin; cột DB vẫn ghi.
- **File/commit:** `catalog/subscription/price/subscription-price.policy.ts`, `subscription.policy.ts`, `subscription-view.service.ts`, `subscription.dto.ts` — `bf773874`.
- **Đổi lại:** đưa lại `EXCHANGE_RATE` vào `missingData` và enum DTO; cột DB không đổi.

## Bị chặn

## Dừng ở đâu

## Tóm tắt cho Owner

### D-6 — Hồ sơ bổ sung cũ: bỏ rồi thêm lại hai CHECK `NOT VALID` quanh UPDATE của migration (thay vì chỉ quy hồ sơ thỏa CHECK)

- **Câu hỏi:** `request_supplements_retired_spend_day_check` (không có ngày chi) và `request_supplements_change_v2_check` (số tiền hoặc ngày kết thúc phải đổi), cả hai `NOT VALID` ở `20261109130000`, vẫn kiểm mọi phiên bản mới của một hàng, kể cả hàng cũ trước 09/11 (có ngày chi, số tiền có thể bằng nhau) ⟹ UPDATE quy VND dừng ở 23514 và cả migration dừng.
- **Phương án:** (a) bỏ hai CHECK, UPDATE, thêm lại đúng định nghĩa `NOT VALID`, cùng giao dịch; (b) chỉ UPDATE hồ sơ thỏa CHECK, liệt kê phần còn lại trong NOTICE.
- **Đã chọn (tạm chốt):** (a). Căn cứ: (b) để lại hồ sơ bổ sung bằng USD bên cạnh Request đã quy VND, đúng thứ mà QĐ-111an muốn bỏ; (a) khôi phục nguyên định nghĩa (không validate hàng cũ, hồ sơ mới vẫn bị chặn; test dựng lịch sử cũ kiểm cả hai), cùng một giao dịch với DISABLE/ENABLE trigger nên không phiên nào thấy trạng thái thiếu. Rủi ro còn lại: `DROP/ADD CONSTRAINT` giữ khóa bảng ngắn; migration chạy một lần ngoài giờ.
- **File/commit:** `prisma/migrations/20261113002900_fx_prices_to_vnd/migration.sql` (sửa tại chỗ vì chưa chạy trên DB thật, như D-3), `test/integration/catalog/fx-prices-to-vnd-upgrade.integration-spec.ts` — `71b32df6`.
- **Đổi lại:** nếu Owner muốn (b): bỏ `DROP/ADD CONSTRAINT`, thêm điều kiện lọc hàng thỏa CHECK ở `fx_supplement_changes` và NOTICE cho phần còn lại; migration chưa chạy thật nên sửa tại chỗ.

### D-7 — `RATE_MISSING` đã lưu (Request, dòng lô) đọc ra thành `PRICE_MISSING`; mã bỏ khỏi mọi enum OpenAPI

- **Câu hỏi:** SPEC §5 FX-2 vừa nói "mapper hiển thị như lý do đã ngừng" vừa nói "bỏ mã khỏi OpenAPI". `access_requests.one_step_blocked_reason` (CHECK còn cho `RATE_MISSING`) và `spend_batch_items.stop_reason` có thể còn giá trị cũ.
- **Phương án:** (a) giữ `RATE_MISSING` trong enum như mã "chỉ đọc, không bao giờ cho" (như `STALE_COST_EVIDENCE`) — trái "bỏ khỏi OpenAPI"; (b) đọc ra `PRICE_MISSING` (một hàm `currentMissingReasonOf`, theo mẫu `currentStateOf`), enum bỏ mã; (c) đọc ra rỗng.
- **Đã chọn:** (b). Căn cứ: SPEC §5 FX-2 + PLAN FX-2.3 ("grep `RATE_MISSING` chỉ còn mapper đọc"); nghĩa cũ (không có tỷ giá để quy ra VND) = giá chưa ở VND = thiếu giá VND, nên người gửi/IT Admin xử lý y như `PRICE_MISSING`. Test: unit `access-request.policy.spec`, `spend-submission.policy.spec`; integration `one-step-supplement-rate` (SQL đặt `RATE_MISSING`, wire trả `PRICE_MISSING`; đột biến mapper đi thẳng làm ca đỏ).
- **File/commit:** `requests/access-request/access-request.policy.ts` (`currentMissingReasonOf`), `access-request-record.mapper.ts`, `spend/spend-submission.policy.ts` (`stopReasonOf`), `spend/spend-batch.repo.ts` — `c9e58380`, `409758ea`, `3ae4c509`.
- **Đổi lại:** thêm `RATE_MISSING` vào 3 enum DTO (`access-request.dto`, `spend-submission.dto` ×2) và các kiểu; `currentMissingReasonOf` thành hàm đồng nhất.

### D-8 — Giá/số tiền còn ở ngoại tệ (cũ, không quy được) ⟹ kiểm ngân sách `PRICE_MISSING`, khoản 01/01 `NO_PRICE`; không quy đổi

- **Câu hỏi:** SPEC nói kiểm ngân sách và khoản 01/01 "dùng thẳng số VND", nhưng migration FX-1 để nguyên dòng ngoại tệ không có tỷ giá (Request chưa duyệt chi, thuê bao), nên số tiền ngoại tệ vẫn có thể tới hai chỗ này.
- **Phương án:** (a) coi số minor của ngoại tệ như VND (sai số tiền, nguy hiểm); (b) ném lỗi lập trình (500 trên đường người dùng, và job 01/01 dừng); (c) coi như chưa có giá hợp lệ: kiểm ngân sách `NOT_CHECKABLE PRICE_MISSING` (một-bước ⟹ trả người gửi), khoản 01/01 bỏ qua `NO_PRICE` kèm audit.
- **Đã chọn:** (c), cùng luật với D-5 (bản nháp ngoại tệ = thiếu giá) và FX-1-R3 (báo giá ngoại tệ không định giá). Hàm thuần `costInDong` (`budget-check.policy`) và `isRecurringPriceInDong` (`year-start-commitments.policy`) có unit test.
- **File/commit:** `requests/spend/budget-check.policy.ts`, `budget-check.service.ts` (`FinanceApi` khỏi constructor) — `02ff11d5`; `requests/year-start-commitments/*` — `0ac38149`.
- **Đổi lại:** thay hai hàm thuần bằng nhánh khác (ví dụ lỗi) — một chỗ mỗi nơi.

### D-9 — Khoản 01/01: `BudgetsApi.holdYearStart` còn từ chối `CURRENCY_MISMATCH` ⟹ lô ném lỗi, không ghi lý do bỏ qua

- **Câu hỏi:** SPEC FX-2.4 bảo bỏ `CURRENCY_MISMATCH` khỏi lý do bỏ qua của khoản 01/01, nhưng facade ngân sách (ngoài danh sách file FX-2) vẫn trả `refused` khi phiên bản duyệt của năm ở tiền tệ khác số tiền.
- **Phương án:** (a) vẫn ghi `CURRENCY_MISMATCH` (trái "thôi ghi"); (b) sửa facade ngân sách (ngoài phạm vi, đụng contract khó lùi); (c) coi `refused` là lỗi dữ liệu: ném `Error` (cả lô rollback, lượt sau thử lại, job báo lỗi) vì mọi số tiền và mọi phiên bản ngân sách đều ở VND.
- **Đã chọn:** (c). Căn cứ: QĐ-111an (một tiền tệ), "tiền tệ khác ⟹ lỗi lập trình" (SPEC FX-2); không âm thầm bỏ mất khoản. Test: `year-start-commitments-batch.service.spec` (`rejects.toThrow('is not in dong')`, không ghi audit bỏ qua).
- **File/commit:** `requests/year-start-commitments/year-start-commitments-batch.service.ts` — `0ac38149`.
- **Đổi lại:** trả lại vòng `for (const refused of held.refused) leftOut.push(...)` và thêm lại `CURRENCY_MISMATCH` vào `YearStartSkipReason`. **Hở còn lại (Owner quyết, ngoài FX-2):** lệnh cài đặt (`installation.dto`, `--currency`) vẫn nhận mọi mã tiền tệ làm `reportingCurrency`; D2 nói tiền tệ báo cáo cố định VND — một cài đặt không phải VND sẽ làm `snapshotMoney` ném lỗi và mục trên ném lỗi.

### D-10 — FX-2.5 xóa hẳn code tỷ giá thay vì chỉ gỡ khỏi wiring; `snapshotMoney` trả thẳng snapshot

- **Câu hỏi:** SPEC FX-2.5 viết "gỡ `finance/exchange-rate/` khỏi wiring" và "`snapshotMoney` còn trả snapshot đồng nhất"; D1 viết "route bỏ xóa luôn".
- **Phương án:** (a) chỉ gỡ wiring, để service/repo/ledger/DTO/test mồ côi; (b) xóa thư mục `finance/exchange-rate/` (10 file), `OrganizationApi.setReportingCurrency` và repo, `ReportingCurrencyLockedError`, `core/money/convert.ts`; giữ bảng, trigger, `rate.ts`; `snapshotMoney` trả `ConversionSnapshot` (không còn bọc `{ status }`, không `MISSING_RATE`), tiền tệ khác tiền tệ báo cáo ⟹ `Error`.
- **Đã chọn:** (b). Căn cứ: D1, S-1, "bảng giữ" (dữ liệu không mất); code mồ côi + test của nó chỉ làm gate sai nghĩa. `snapshotMoney` hiện không có nơi gọi nào trong `src` (SPEC bắt giữ) — chỉ test integration dùng.
- **File/commit:** `d5b6ec29` (+ `GET /reporting-currency` giữ, trả giá trị lưu của tổ chức — VND theo migration FX-1 và cài đặt, không phải hằng).
- **Đổi lại:** `git revert d5b6ec29` khôi phục toàn bộ; không có migration nào để đổi.

### D-11 — Hai việc FX-1 để lại cho FX-2 ngoài danh sách bốn test

- **Câu hỏi:** chạy test HTTP nền tảng (OpenAPI) sau FX-1 thấy đỏ: manifest mã lỗi từng route còn `REPORTING_CURRENCY_NOT_SUPPORTED`, thiếu `SUBSCRIPTION.PRICE_NOT_VND` và `ASSESSMENT.QUOTE_PRICE_NOT_VND`; test đếm route (379) lệch khi bỏ 3 route.
- **Đã chọn:** sửa manifest (`openapi-example-route-codes-catalog/requests`), đổi test "REPORTING_CURRENCY_NOT_SUPPORTED đúng chỗ quy đổi" thành "không route nào khai mã đó", đếm 379 → 376. Căn cứ: brief ("không để test đỏ ở gate"), D1.
- **File/commit:** `d5b6ec29`.
- **Đổi lại:** không cần; lỗi `REPORTING_CURRENCY_NOT_SUPPORTED` (lớp ở `core/money/money.errors.ts` + ánh xạ ở `infrastructure/http/errors/money-errors.ts`) hiện không còn nơi ném — dọn ở đợt sau cùng tài liệu API.

### D-12 — Lệnh cài đặt chỉ nhận `VND` làm tiền tệ báo cáo (đóng hở của D-9)

- **Câu hỏi:** `installationInputSchema.reportingCurrency` (và `--currency` của CLI, `BOOTSTRAP_CURRENCY` của script) nhận mọi mã ISO, trái R-4/D2 "tiền báo cáo cố định VND": cài đặt khác VND làm hỏng luồng (trigger giá thuê bao 23514, kiểm ngân sách so số VND với ngân sách khác tiền, lô 01/01 ném lỗi D-9).
- **Phương án:** (a) để nguyên, ghi cảnh báo; (b) DTO chỉ nhận `VND` (refine `=== DONG`), giữ nguyên kiểm danh mục tiền tệ cho `VND`, CLI/script vẫn truyền `--currency` nhưng mã khác bị từ chối ở DTO; (c) bỏ hẳn `--currency`/`BOOTSTRAP_CURRENCY` (đổi contract của script đã triển khai).
- **Đã chọn (tạm chốt):** (b). Căn cứ: QĐ-111an, R-4, D2; rẻ, không migration (FX-1 đã `RAISE` với tổ chức không VND), cấu hình cũ `BOOTSTRAP_CURRENCY=VND` vẫn chạy. Lỗi: `InstallationInputError` `reportingCurrency: must be VND: every amount is in dong and nothing is converted`. Test: `installation.dto.spec` (USD/MYR/EUR), `installation.api.spec` (mã khác VND bị từ chối trước khi băm/khóa; `VND` thiếu trong danh mục vẫn bị từ chối), integration `installation`, `installation-cli` xanh.
- **File/commit:** `modules/installation/installation.dto.ts`, `public/installation.api.ts`, `cli/bootstrap/bootstrap.arguments.ts` (help), `scripts/verify/bootstrap-installation.test.mjs` (mẫu `VND`), `docs/guides/bootstrap-installation.md`, `.env.bootstrap.example` — `a667451d`.
- **Đổi lại:** nới lại `reportingCurrency` về `regex(/^[A-Z]{3}$/)`; không đụng DB.
