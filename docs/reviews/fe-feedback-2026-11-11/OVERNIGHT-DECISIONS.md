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

### D-13 — `ACCESS_REQUEST.OPEN_LIMIT_REACHED` đổi từ 409 sang 422, `details { limit, resetsOn }` (bỏ `openRequestIds`)

- **Câu hỏi:** SPEC §5 RQ-1 chỉ nói "lỗi `OPEN_LIMIT_REACHED` `details { limit, resetsOn }`", không nói status; code hiện hành là 409 `{ limit, openRequestIds }`. SPEC §8 T-RQ1 viết "Request thứ 11 lúc CN 15/11 23:30 ⟹ **422**, `resetsOn = 2026-11-16`".
- **Phương án:** (a) giữ 409 (không đổi contract), chỉ thêm `resetsOn`; (b) theo T-RQ1: 422; (c) 422 và giữ cả `openRequestIds`.
- **Đã chọn (tạm chốt):** (b). Căn cứ: thứ tự "SPEC/PLAN trước code": T-RQ1 là dòng test của SPEC và brief giao việc lặp lại 422; luật `api-contract.md` "một mã lỗi chỉ đi với một status" nên đổi cả mã (mọi route gửi, kể cả `renewals`/`proposals`/draft) chứ không để hai status; `openRequestIds` bỏ vì từ nay đếm cả Request đã rút/từ chối (liệt kê id không còn là "những Request đang mở") và SPEC ghi đúng hai khóa. Ví dụ OpenAPI, mô tả 4 controller và `test/support/openapi-example-route-codes-requests.ts` đã chuyển mã sang danh sách 422.
- **File/commit:** `access-request/access-request.http-errors.ts` (status + details), `access-request.errors.ts`, 4 controller (`access-requests`, `request-drafts`, `proposals`, `renewal-requests`) — `0a2c6d0c`.
- **Đổi lại:** một dòng `HttpStatus.UNPROCESSABLE_ENTITY` ⟹ `CONFLICT` ở `access-request.http-errors.ts`, đưa mã về danh sách 409 ở `openapi-example-route-codes-requests.ts` + mô tả controller; tài liệu API FE (Docs, lượt audit) hiện ghi 409 ⟹ phải sửa theo.

### D-14 — Bỏ GH-3 khỏi dây: `flags` bỏ hẳn, preview bỏ 3 trường, thêm `limits.resetsOn`, khóa kiểm toán thôi ghi

- **Câu hỏi:** SPEC §5 RQ-1 "bỏ `manyPaidSoftwareReason` (body, gồm `renewal-request.dto.ts:29`) và `flags.manyPaidSoftware`": `flags` chỉ còn một phần tử thì thành `flags: {}` hay bỏ hẳn; preview `limits` còn `paidSoftwareCount/paidSoftwareThreshold/reasonRequired`; `openNewCount/openNewMax` còn ý nghĩa "đang mở"; sự kiện kiểm toán `ACCESS_REQUEST.SUBMITTED` ghi `manyPaidSoftwareCount`; body còn gửi `manyPaidSoftwareReason`.
- **Phương án:** (a) giữ `flags: {}` / giữ tên cũ không thêm gì; (b) bỏ `flags` hẳn ở Request và dòng lịch sử, bỏ 3 trường paid khỏi preview, giữ tên `openNewCount/openNewMax` nhưng nghĩa là "đã gửi tuần này / tối đa", thêm `resetsOn` để FE dựng câu "gửi lại từ thứ Hai 23/11" (F4 §3.2); (c) đổi tên sang `sentThisWeek*`.
- **Đã chọn (tạm chốt):** (b). Căn cứ: SPEC nói "bỏ `flags.manyPaidSoftware`" (một object rỗng là rác trên dây); (c) là đổi tên hợp đồng SPEC không yêu cầu, (b) chỉ thêm một khóa. Body còn `manyPaidSoftwareReason` ⟹ 422 `VALIDATION_ERROR` như mọi khóa lạ (schema đã `strictObject`, test `request-limits.http-spec` cho cả 5 form). Khóa `manyPaidSoftwareCount` của kiểm toán `ACCESS_REQUEST.SUBMITTED` thôi ghi (dòng cũ giữ nguyên). Request/dòng cũ đã mang cờ: cột `many_paid_software*` còn nguyên trong DB, không ai đọc, không ai ghi (đúng SPEC §6 "thôi ghi", không drop).
- **File/commit:** `access-request.dto.ts` (`flags`, body), `group-request.dto.ts`, `renewal-request.dto.ts`, `assessment.dto.ts`, `request-history.dto.ts`, `request-preview.dto.ts/service.ts`, `request-view/access-request-query.service.ts`, `request-history.service.ts`, `my-requests-facts.repo.ts`, `access-request-record.mapper.ts`, `access-request.repo.ts`, `request-line.repo.ts`, `access-request-submission.mapper.ts` — `0a2c6d0c`, `965056d4`.
- **Đổi lại:** thêm lại các trường vào DTO + đọc cột; không cần migration (cột chưa bị bỏ).

### D-15 — `PAID_SOFTWARE_FLAG_THRESHOLD` bỏ khỏi registry; mặc định `REQUEST_OPEN_NEW_LIMIT` 10 chỉ cho tổ chức chưa lưu giá trị; xóa đoạn đọc "phần mềm trả phí" của licensing

- **Câu hỏi:** SPEC nói "`PAID_SOFTWARE_FLAG_THRESHOLD` thôi dùng" và "`REQUEST_OPEN_NEW_LIMIT` giữ khóa, đổi nghĩa, mặc định 10". Ba điểm mở: tham số thôi dùng còn hiện trên màn Super Admin hay bỏ; tổ chức đã lưu `REQUEST_OPEN_NEW_LIMIT = 3` (nghĩa cũ "đang mở") thì sao; `LicensingApi.listPaidApplicationsOf` (chỉ GH-3 gọi) còn hay xóa.
- **Phương án:** (a) giữ định nghĩa `PAID_SOFTWARE_FLAG_THRESHOLD` không ai đọc; (b) xóa định nghĩa (tiền lệ `TRANSFER_REVIEW_WORKING_DAYS`, QĐ-110p: `definitionOf(...)` ⟹ `undefined`), hàng đã lưu ở `parameter_values` nằm yên vì danh sách đi theo định nghĩa; với `REQUEST_OPEN_NEW_LIMIT`: (c) chỉ đổi mặc định, hoặc (d) thêm migration ghi đè giá trị đã lưu; với licensing: (e) để lại, hoặc (f) xóa chuỗi `listPaidApplicationsOf` → `paidApplicationsOf` ×2.
- **Đã chọn (tạm chốt):** (b)+(c)+(f). Căn cứ: Super Admin không nên thấy một ô chỉnh không có tác dụng; (d) tự ý ghi đè giá trị Owner đã đặt (không xóa/không ghi đè dữ liệu) — chỉ tổ chức chưa từng đặt mới nhận 10, tổ chức đã đặt 3 sẽ thấy "3 Request/tuần" cho tới khi Super Admin sửa (ghi ở HANDOFF để Z2/Owner biết); (f) là mã chết sau khi GH-3 đi (không còn test hay nơi gọi), cùng tinh thần D-10 xóa hẳn thay vì để treo.
- **File/commit:** `operating-parameters/parameter-definitions.policy.ts` (+ spec, integration `operating-parameters-http`: 30 ⟹ 29 khóa), `licensing/public/licensing.api.ts`, `licensing/provisioning/revocation-view.service.ts`, `revocation-read.repo.ts` — `0a2c6d0c`, `965056d4`.
- **Đổi lại:** thêm lại định nghĩa vào `PARAMETER_DEFINITIONS` (cột giá trị cũ vẫn còn); khôi phục ba hàm licensing từ `git show 0a2c6d0c^`.

### D-16 — Ngày hết hợp đồng của nhân sự có thời hạn: cột mới `employees.contract_end_date` (đã đổi tên và có đường ghi ở D-21)

- **Câu hỏi:** R-38/`INV-07`/`FR-2.8` bắt hệ thống "cắt tại ngày hết hợp đồng" và US-05-23 nêu tiền đề "nhân sự có thời hạn có ngày hết hợp đồng", nhưng SPEC RQ-2 ghi "không cột mới" và code không có ngày hết hợp đồng ở đâu (bảng `employees` chỉ có `hire_date`; `expectedEndDate` của body cũ là ngày người xin tự nhập, nay bị bỏ).
- **Phương án:** (a) cột nullable `employees.contract_end_date` (CHECK ≥ `hire_date`), đọc qua `EmployeeRecord.contractEndDate`; (b) không có dữ liệu ⟹ không bao giờ cắt (T-R38 không kiểm được); (c) FE gửi kèm ngày hết hợp đồng (trái `QĐ-111i`: không còn ô ngày).
- **Đã chọn (tạm chốt):** (a). Căn cứ: BRD `FR-2.8`/`INV-07`, R-38, US-05-23 AC-2; expand-only, nullable, không drop, chạy lại an toàn. **Cập nhật theo review:** đường ghi qua `POST/PATCH /employees` đã có (D-21); còn thiếu import `BM-09` (gói khác).
- **File/commit:** `prisma/migrations/20261113003000_rq2_employee_contract_end`, `prisma/models/organization.prisma`, `organization/employee/employee.repo.ts`, `organization/public/organization.types.ts` — `ff5d4529`.
- **Đổi lại:** thôi đọc `contractEndDate` ở `RequestFactsService.termOf`, `RequestTermEndsService`, `ProvisioningGrantPlanner`; cột để nguyên (không drop).

### D-17 — Luật chi tiết của _Thời gian dùng_: vắng/`null`, hợp đồng đã hết, request không giữ ngày kết thúc

- **Câu hỏi:** SPEC nói `termMonths: number | null` nhưng không nói "vắng" khác `null` ra sao, hợp đồng đã hết trước ngày bắt đầu thì sao, và `expected_end_date` của Request còn ghi gì.
- **Đã chọn (tạm chốt):** (1) `K1`: vắng hoặc `null` ⟹ `TERM_REQUIRED`; ngoài 1–9 ⟹ `TERM_MONTHS_OUT_OF_RANGE`. `K2`/`K5`: ngoài 1–12 ⟹ `TERM_MONTHS_OUT_OF_RANGE`; nhân sự chính thức: vắng = `null` = _Dùng lâu dài_; nhân sự có thời hạn: **vắng ⟹ `TERM_REQUIRED`, `null` ⟹ `TERM_LONG_TERM_NOT_ALLOWED`** (T-R38 bullet 2). `K4`: số ⟹ `TERM_NOT_ASKED`. (2) Hợp đồng đã hết trước ngày bắt đầu ⟹ cắt tại ngày bắt đầu, tính 1 tháng đã bắt đầu, không từ chối (không có luật từ chối trong nguồn; không để ngày kết thúc trước ngày bắt đầu). (3) Request lưu `term_months` (null = _Dùng lâu dài_/`K4`) và `expected_end_date` NULL; ngày kết thúc thật của seat = ngày cấp + N tháng − 1 ngày, cắt theo hợp đồng của người giữ lúc cấp (`provisioning-grant-planner` đọc, `provisioning-grant-writer` tính); Request cũ có `expected_end_date` vẫn theo ngày đó (không đổi dữ liệu). (4) `K5` (nội bộ miễn phí) nhận số tháng và seat hết theo số tháng (bỏ loại trừ `INTERNAL_FREE` ở `grant.policy`). (5) Mã `ACCESS_REQUEST.END_DATE_OUT_OF_RANGE` và `GROUP_REQUEST.TERM_BEYOND_LIMIT` bỏ (route đổi, D1 không 410). (6) Bản nháp cũ: khóa `expectedEndDate` bị bỏ khi đọc (người dùng nhập lại số tháng), `termMonths` còn nghĩa.
- **Căn cứ:** `QĐ-111i`/`QĐ-111j`, R-38, R-39, INV-07, SPEC RQ-2; "đơn giản, dễ đổi lại".
- **File/commit:** `core/term-limit.ts` (`checkTermMonths`, `termRunOf`, `monthsBeginningIn`) — `f42b9a9e`; `requests/access-request/*`, `request-intake/*`, `request-submission/*`, `group-request*/*`, `draft/*`, `request-draft/*` — `c5c86612`; `requests/grant/grant.policy.ts`, `licensing/provisioning/tasks/*` — `d77a0bb5`.
- **Đổi lại:** đổi một nhánh của `checkTermMonths`; ngày hết hợp đồng đã qua ⟹ ném lỗi ở `termRunOf`.

### D-18 — Lưu số năm sau lúc duyệt chi: cột `access_request_line_amounts.held`; tên `termCost` ở chi tiết duyệt chi

- **Câu hỏi:** SPEC bảo Request nhóm lưu một hàng `access_request_line_amounts` (năm sau) cho mỗi dòng và "không cột mới", nhưng bảng này là phần của dòng trong **cam kết** (`releaseForRequest` trả lại theo năm): hàng năm sau chưa có cam kết nào giữ ⟹ rút người/hủy Request sẽ gọi trả lại năm không có cam kết (từ chối). Thứ hai, chi tiết duyệt chi đã có khóa `cost` (ước tính thuế) trong khi SPEC đặt tên khối mới cũng là `cost`.
- **Phương án:** (a) không cột, nhận diện hàng năm sau bằng "năm nhỏ nhất của người" — hở với dữ liệu cũ nhiều năm; (b) cột `held BOOLEAN NOT NULL DEFAULT TRUE`, hàng năm sau `held = false`, `shareToRelease` và `share` ở màn dòng chỉ lấy `held`; (c) bảng riêng. Tên: (d) `termCost` ở chi tiết duyệt chi, `cost` ở xem trước và chi tiết Request.
- **Đã chọn (tạm chốt):** (b) + (d). Căn cứ: không phá luật trả lại (`QĐ-104a`, US-05-17 AC-10) và dữ liệu cũ; expand-only, mặc định giữ nguyên hàng cũ. Request cá nhân: `next_year_amount_minor` do `BudgetCheckService.run` ghi lúc duyệt (so sánh `isSameAmount` xét thêm số năm sau). Request nhóm: mỗi người được duyệt một hàng `held = false` tính theo hợp đồng riêng của người đó; `next_year_amount_minor` của Request = tổng. `GET /spend-approvals` (danh sách) **không** thêm khối này (chỉ chi tiết).
- **File/commit:** `prisma/migrations/20261113003100_rq2_line_amount_held`, `requests/group-line-decisions/group-spend-hold.service.ts`, `requests/spend/line-allocation.policy.ts`, `requests/spend/budget-check.service.ts`, `requests/spend-approval-view/*` — `31bc0f8b`, `c2e7a542`.
- **Đổi lại:** bỏ ghi hàng `held = false` ở `GroupSpendHold` (cột để nguyên); đổi khóa `termCost` thành `cost` khi Owner muốn gộp (cần đổi ước tính thuế).

### D-19 — Request nhóm: chia phần cam kết vẫn chia đều; các điểm nhỏ của RQ-2

- **Câu hỏi/đã chọn (tạm chốt):** (1) Giá của Request nhóm = tổng từng người theo ngày kết thúc riêng (người bị cắt rẻ hơn); `amountMonths` của Request nhóm = số tháng lớn nhất. **Cập nhật theo review:** chia đều đã bỏ, cam kết theo số tiền từng người (D-23). (2) Hồ sơ bổ sung (`POST …/supplements`): `termMonths` phải ngắn hơn số tháng đang có (`_Dùng lâu dài_` thì số nào 1–12 cũng ngắn hơn); Request cũ có ngày thì mọi số tháng đều coi là ngắn hơn; mã `SPEND.SUPPLEMENT_END_DATE_OUT_OF_RANGE` ⟹ `SPEND.SUPPLEMENT_TERM_MONTHS_OUT_OF_RANGE`; ngày trước/sau của hồ sơ = ngày kết thúc nếu số tháng bắt đầu hôm nay. (3) Đề xuất phần mềm ngoài danh mục (case B): chưa biết kiểu cấp ⟹ luật `K2` (1–12 hoặc không). (4) Request tiếp tục gửi trễ (chuyển thành Request mới) gửi `termMonths = extensionMonths`; RQ-3 làm lại. (5) Thẻ tác vụ cấp: `termCutAt` = ngày hết hạn của quyền khi trùng ngày hết hợp đồng của người giữ.
- **File/commit:** `group-request-submission/*`, `group-request/*`, `spend-submission/*`, `assessment/*`, `renewal-request/*`, `licensing/provisioning/provisioning-task-view.service.ts` — `c5c86612`, `d77a0bb5`.
- **Đổi lại:** mỗi mục một chỗ; (1) đổi `allocateEvenly` sang chia theo dòng cần thêm dữ liệu từng dòng ở `GroupSpendHold`.

### D-20 — Nhân sự có thời hạn xin gói mua một lần (`K4`): chỉ khi biết ngày hết hợp đồng, seat hết ở ngày đó

- **Câu hỏi:** `K4` không hỏi số tháng ⟹ seat không có ngày kết thúc, nhưng `INV-07` (trigger `license_assignments_rules`) bắt seat của nhà thầu/freelancer/thực tập có ngày kết thúc: Request gửi 201, duyệt chi (tiền đã cam kết), IT cấp ⟹ 422 `EXPECTED_END_REQUIRED`.
- **Phương án:** (a) chặn ngay lúc gửi mọi nhân sự có thời hạn xin `K4`; (b) cho phép khi biết `contractEndDate`, seat hết ở ngày đó, còn không biết thì chặn bằng `TERM_LONG_TERM_NOT_ALLOWED`; (c) chỉ sửa ở bước cấp.
- **Đã chọn (tạm chốt):** (b). Căn cứ: R-38 (cắt ở ngày hết hợp đồng), `INV-07`; không cấm oan người có hợp đồng; mã `TERM_LONG_TERM_NOT_ALLOWED` đúng nghĩa "quyền không có ngày kết thúc cho người có thời hạn". Lúc cấp: seat không bị ràng buộc theo tháng của người có thời hạn ⟹ ngày kết thúc = ngày hết hợp đồng (`ProvisioningGrantPlanner` đọc loại nhân sự + ngày, `ProvisioningGrantWriter.endOfSeat`).
- **File/commit:** `core/term-limit.ts` (`checkTermMonths` tham số `contractEndKnown`), `requests/access-request/request-facts.service.ts`, `licensing/provisioning/tasks/provisioning-grant-planner.service.ts`, `provisioning-grant-writer.service.ts` — `bba09477`.
- **Đổi lại:** (a) = bỏ nhánh `contractEndKnown` trong `checkTermMonths` (K4 + người có thời hạn luôn bị chặn).

### D-21 — `contract_end_date` theo thiết kế `qd96-100-approved-end-date`, có đường ghi tối thiểu (sửa D-16)

- **Câu hỏi:** D-16 đặt `employees.contract_ends_on`, chưa có đường ghi; thiết kế cũ của đợt trước (`docs/workspace/items/qd96-100-approved-end-date/spec.md` phần B, chưa từng build) đã chọn `employees.contract_end_date` / `contractEndDate`, CHECK STAFF ⟹ NULL, lỗi `EMPLOYEE.CONTRACT_END_NOT_APPLICABLE`.
- **Đã chọn (tạm chốt):** đổi tên theo thiết kế cũ (API `contractEndDate`); sửa migration `20261113003000` **tại chỗ** vì chưa merge, chưa chạy trên DB thật (DB test dựng mới mỗi lần chạy); thêm CHECK `employment_type <> 'STAFF' OR contract_end_date IS NULL` và giữ CHECK `>= hire_date`. Đường ghi: `contractEndDate` (`date|null`) ở `POST /employees` và `PATCH /employees/{id}` (trường chính thức, có audit before/after), lỗi dòng `CONTRACT_END_NOT_APPLICABLE` (nhân sự chính thức có ngày, hoặc đổi sang STAFF mà còn ngày) và `CONTRACT_END_BEFORE_HIRE` (ngày trước ngày vào làm, kể cả dời `hireDate` quá ngày này); cột vẫn NULLABLE (dữ liệu cũ không có; vắng ⟹ `TERM_REQUIRED` như D-17). **Không làm:** import `BM-09` (cột `contract_end_date` ở file import, thiết kế cũ mục 1) — hở, ghi HANDOFF; không sửa seed.
- **File/commit:** `prisma/migrations/20261113003000_rq2_employee_contract_end`, `organization/employee/*`, `organization/public/organization.types.ts` — `d99c21c3`.
- **Đổi lại:** đổi tên cột bằng migration mới nếu migration đã chạy ở đâu đó; bỏ `contractEndDate` khỏi DTO để ngừng cho ghi.

### D-22 — Guard `access_request_line_amounts_guard` giữ `held`

- **Câu hỏi:** guard cũ chỉ so (request, employee, year, amount, currency) nên `held` sửa được bằng UPDATE; lật `held` false→true làm `shareToRelease` trả lại cam kết chưa từng giữ.
- **Đã chọn:** migration mới `20261113003200_rq2_line_amount_guard_held`: `CREATE OR REPLACE FUNCTION` thêm `NEW.held IS DISTINCT FROM OLD.held`; không sửa migration `…003100`. Test: `group-request-constraints` (lật cả hai chiều ⟹ `55000`; `released_at` vẫn ghi được một lần).
- **File/commit:** `prisma/migrations/20261113003200_rq2_line_amount_guard_held` — `608341db`.
- **Đổi lại:** migration mới đưa hàm về bản cũ; cột không đổi.

### D-23 — Request nhóm: cam kết theo số tiền từng người (thay phần "chia đều" của D-19)

- **Câu hỏi:** cam kết năm nay, phần trả khi rút người và quy đổi khi duyệt một phần chia ĐỀU ⟹ có dòng bị cắt thì cam kết ≠ tổng từng người (nhóm {F, F, C<F} duyệt hai người đủ giữ thiếu).
- **Đã chọn (tạm chốt):** `CheckScope.employeeIds`: lúc duyệt, kiểm ngân sách tính giá lại **chỉ những người được duyệt**, mỗi người theo ngày kết thúc riêng (`RepricingService`), không chia đều cả nhóm; `lineAmountsOf` (`spend/line-allocation.policy.ts`): người cùng ngày kết thúc tính một lần rồi chia đều trong nhóm đó (phần dư cho người đầu), tổng đúng bằng giá của Request; phần của từng dòng trong cam kết năm nay và hàng năm sau (`held = false`) lấy từ đó; nếu tổng từng người không khớp số cam kết thì rơi về chia đều (an toàn). Request giữ tổng (`amount_minor`, `next_year_amount_minor`). Rút người trả đúng phần đã lưu của người đó (không đổi). **Còn hở (hiển thị, không phải tiền):** `cost` của từng dòng ở `GET /access-requests/{id}/lines` trước khi duyệt vẫn là phần chia đều của tổng.
- **File/commit:** `requests/spend/budget-check.service.ts`, `spend/line-allocation.policy.ts`, `group-line-decisions/group-spend-decision.service.ts`, `group-spend-hold.service.ts` — `3dbbc891`; test số cố định `7e72533d`.
- **Đổi lại:** bỏ `employeeIds` ở `group-spend-decision.service.ts` ⟹ trở về chia đều (hai ca số cố định đỏ).

### D-24 — Khối `cost` của Request đã gửi đọc từ số đã lưu, không từ ngày xem

- **Câu hỏi:** `RequestCostViewService` chạy `termRunOf` từ `new Date()` ⟹ `cost.months`/`nextYear.months`/`termCutAt` đổi theo ngày xem, lệch sau 01/01 và không khớp số tiền đã lưu; nhóm hiện tháng không cắt cạnh tiền đã cắt.
- **Đã chọn (tạm chốt):** suy từ số đã lưu: tháng năm nay = `amountMonths`; tháng năm sau = số tháng mà `nextYearAmount` đại diện (số ít nhất mà giá làm tròn lên đúng bằng số đã lưu; _Dùng lâu dài_ = 12); tháng đã bắt đầu = hai số cộng lại; `termCutAt` = ngày hết hợp đồng khi số tháng đã bắt đầu < số tháng xin (lệch nhỏ: cắt mà vẫn đủ tháng đã bắt đầu thì không báo cắt). Nhóm: số tiền, **không** tháng/cắt (null). Xem trước (chưa lưu gì) vẫn tính theo hôm nay.
- **File/commit:** `requests/request-view/request-cost-view.service.ts`, `pricing-view.service.ts` — `71fd9c89`, `fe1cc22e`.
- **Đổi lại:** lưu thêm số tháng đã bắt đầu vào Request nếu muốn con số tuyệt đối thay vì suy.

### D-25 — Hồ sơ bổ sung theo kiểu cấp của gói và ngày của Request cũ

- **Câu hỏi:** `/supplements` nhận `termMonths` mà không kiểm theo kiểu cấp; Request cũ có ngày thì `current = null` ⟹ nhận mọi số tháng (có thể kéo dài).
- **Đã chọn:** kiểu cấp lấy từ gói (`CatalogApi.findPlanSeatTargets`; đề xuất ngoài danh mục dùng luật `K2`): `K4` ⟹ 409 `SPEND.SUPPLEMENT_TERM_NOT_ASKED`; `K1` tối đa 9; Request cũ có ngày: số tháng phải kết thúc **sớm hơn** ngày đó (`termEndOf(hôm nay, tháng) < ngày`), nếu không `TERM_NOT_REDUCED`.
- **File/commit:** `spend/spend-submission.policy.ts`, `spend/spend.errors.ts`, `spend-submission/supplement-pricing.service.ts`, `supplement.service.ts` — `fe6bd36e`.
- **Đổi lại:** một nhánh của `checkSupplementTerm`.

*Bổ sung D-17 (review 8):* `K1` + người có thời hạn: `termMonths: null` ⟹ `TERM_LONG_TERM_NOT_ALLOWED`, vắng ⟹ `TERM_REQUIRED` (T-R38 bullet 2); nhân sự chính thức trên `K1` vắng/`null` ⟹ `TERM_REQUIRED` — `64c3778b`.
