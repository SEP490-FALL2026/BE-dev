# FIX-TEST — làn `tech` (đợt 1 thiết kế lại)

Test cũ khẳng định hành vi cũ mà không chạy được ở máy (http/integration/flow): ghi ở đây, không xóa, không `skip`.

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| P12 | `test/integration/identity-access/password-change-http.integration-spec.ts` | `queues one notice to the stored email with no link…` (bộ khóa payload) | Payload thêm `timeZone` (W1-15): bộ khóa là `at`, `event`, `fullName`, `timeZone`; giá trị bằng múi giờ của tổ chức |
| P12 | `test/integration/identity-access/password-reset-http.integration-spec.ts` | `queues exactly one notice, to the stored email…` (bộ khóa payload) | Như trên |
| P12 | `test/integration/notifications/email-outbox.integration-spec.ts` | `is sent without ever asking whether a link is usable…` | Thư viết giờ theo đồng hồ của tổ chức (`16/10/2026 16:00 (GMT+7)`), không còn in chuỗi ISO |
