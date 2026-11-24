# FIX-TEST — Đợt 3 thiết kế lại, làn `biz`

Danh sách các test http / integration / flow cũ khẳng định hành vi cũ, không xóa / không `skip` trong lúc làm gói; chỉ ghi để xử lý cuối đợt.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| P1 | `test/integration/catalog/shared-pool-subscription-http.integration-spec.ts` | `Q-09: a new write names only MONTHLY or ANNUAL...` (dòng 116-135) | Kỳ vọng cũ `422 SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED` cho `POST`/`PATCH` với `QUARTERLY`/`OTHER`; theo SPEC-B1 W3-02 #4 DTO ghi chỉ nhận `MONTHLY`/`ANNUAL` nên trả `422 VALIDATION_ERROR`. |
