# A-T1 — Đặc tả Request đơn

- Harness `buildTicketWorld` có commit riêng. Fixture dùng ngày `2026-06-01`, workspace và dòng giá của K2, lot của K4 và các vai của phòng thiết kế.
- Ba spec unit có 27 test xanh. Lần chạy đầu phát hiện fixture thiếu `needSteps` và `blockReasons`; chỉ sửa fixture test.
- `request-single-characterization.integration-spec.ts` kiểm qua route thật và đạt ở cả B0 và B1.
- `RETRYABLE` và `COMMITMENT_NOT_HOLDABLE` đã có ca trong `spend-batch-decision.service.spec.ts`.
- D-1, cần Owner nếu muốn đổi hợp đồng HTTP. Guard hiện tại trả `422 REQUEST_PARTY.INELIGIBLE` với `UNPLACED` khi nhân viên chưa từng được xếp phòng. Test HTTP đặc tả guard đó. `ACCESS_REQUEST.NO_DEPARTMENT` vẫn được đặc tả ở unit. [RequestSenderService](../../../../src/modules/requests/request-intake/request-sender.service.ts)
