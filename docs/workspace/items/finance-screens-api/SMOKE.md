# Smoke API thật — finance-screens-api (06/11/2026)

DB riêng `slm_smoke` (Postgres test local), seed `shared-demo-v3` bằng `pnpm seed:local` (28 bước ĐÃ GHI, gồm `budget.next-year`, `finance.invoices`), API `node dist/main` cổng 3100. `prisma migrate diff` trên DB đó: _No difference detected_. Đăng nhập thật: Finance `phuc.trinh`, trưởng phòng ENG `cuong.le`. Kết quả rút gọn (số tiền VND, đơn vị nhỏ nhất):

```text
LOGIN finance ok
S1 summary 200 {"year":2026,"totals":{"VND":{"currency":"VND","base":{"amount":"250000000","currency":"VND"},"reserve":{"amount":"25000000","currency":"VND"},"total":{"amount":"275000000","currency":"VND"},"committed":{"amount":"330000","currency":"VND"},"spent":{"amount":"493500","currency":"VND"},"remaining":{"amount":"274176500","currency":"VND"},"costCenterCount":3,"overBudgetCount":0}},"lastInvoiceRecordedAt":"2026-11-05T23:53:12.246Z"}
S1 table 200 rows 3 [{"cc":"CC-MKT","base":"60000000","reserve":"6000000","total":"66000000","committed":"225000","spent":"157500","remaining":"65617500"},{"cc":"CC-SAL","base":"70000000","reserve":"7000000","total":"77000000","committed":"0","spent":"231000","remaining":"76769000"},{"cc":"CC-ENG","base":"120000000","reserve":"12000000","total":"132000000","committed":"105000","spent":"105000","remaining":"131790000"}]
S2 proposals 200 [{"year":2027,"state":"SUBMITTED","cc":"CC-ITO"},{"year":2027,"state":"REVIEWED","cc":"CC-SAL"},{"year":2027,"state":"REVIEWED","cc":"CC-MKT"},{"year":2027,"state":"REVIEWED","cc":"CC-ENG"},{"year":2026,"state":"REVIEWED","cc":"CC-SAL"},{"year":2026,"state":"REVIEWED","cc":"CC-MKT"},{"year":2026,"state":"REVIEWED","cc":"CC-ENG"}]
S3 batches 200 n 5 [{"dep":"Phòng Kinh doanh","items":1,"ok":1,"wait":0,"amt":{"VND":"210000"}},{"dep":"Phòng Marketing","items":1,"ok":1,"wait":0,"amt":{"VND":"375000"}},{"dep":"Phòng Thiết kế","items":1,"ok":0,"wait":1,"amt":{}},{"dep":"Phòng Kỹ thuật","items":1,"ok":0,"wait":1,"amt":{}},{"dep":"Phòng Kỹ thuật","items":1,"ok":1,"wait":0,"amt":{"VND":"210000"}}]
S3 batch detail 200 items 200 1
S5 commitments 200 n 3 [{"cc":"CC-SAL","st":"EXPENSED","amt":"210000","held":"0","inv":"231000","n":1,"flag":true,"sw":"Jira Software"},{"cc":"CC-MKT","st":"HELD","amt":"375000","held":"225000","inv":"157500","n":1,"flag":false,"sw":"Figma"},{"cc":"CC-ENG","st":"HELD","amt":"210000","held":"105000","inv":"105000","n":1,"flag":false,"sw":"Jira Software"}]
S5 state=HELD 200 n 2 allHeld true
S4 invoices of one 200 [{"no":"SV-HD3","net":"231000","ded":"0","nd":"0","cost":"231000","m":"PRICE_QUANTITY_EXCEPTION"}]
S4 record 201 {"m":"TAX_ONLY","cost":{"amount":"1100","currency":"VND"},"heldBefore":"225000","heldAfter":"224000","inv":"158600"}
S4 duplicate 409 INVOICE.DUPLICATE
S4 zero 422 MONEY_OUT_OF_RANGE
S4 currency sent 422
S1 summary after {"year":2026,"totals":{"VND":{"currency":"VND","base":{"amount":"250000000","currency":"VND"},"reserve":{"amount":"25000000","currency":"VND"},"total":{"amount":"275000000","currency":"VND"},"committed":{"amount":"329000","currency":"VND"},"spent":{"amount":"494600","currency":"VND"},"remaining":{"amount":"274176400","currency":"VND"},"costCenterCount":3,"overBudgetCount":0}},"lastInvoiceRecordedAt":"2026-11-05T23:59:48.943Z"} lastInvoice 2026-11-05T23:59:48.943Z
AUTHZ manager /budgets/summary?year=2026 403
AUTHZ manager /budget-commitments 403
AUTHZ manager /spend-batches 403
AUTHZ manager batch of other dept? Phòng Kinh doanh 404
```

Kiểm tay: hóa đơn smoke net 1000 + thuế không khấu trừ 100 + GTGT khấu trừ 50 ⟹ `held` −1000, `committed` −1000, `spent` +1100 (GTGT không vào), `remaining` −100 (đúng phần thuế); `matchResult` TAX_ONLY; trùng số ⟹ 409; net 0 ⟹ 422 `MONEY_OUT_OF_RANGE`; gửi `currency` ⟹ 422; trưởng phòng ⟹ 403 ở 3 route Finance, 404 ở lô phòng khác.
