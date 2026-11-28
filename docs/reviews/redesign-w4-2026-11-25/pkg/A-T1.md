# A-T1 — Đặc tả Request đơn

- Harness `buildTicketWorld` có commit riêng. Fixture dùng ngày `2026-06-01`, workspace và dòng giá của K2, lot của K4 và các vai của phòng thiết kế.
- Ba spec unit có 27 test xanh. Lần chạy đầu phát hiện fixture thiếu `needSteps` và `blockReasons`; chỉ sửa fixture test.
- `request-single-characterization.integration-spec.ts` kiểm qua route thật. CI chưa chạy.
- `RETRYABLE` và `COMMITMENT_NOT_HOLDABLE` đã có ca trong `spend-batch-decision.service.spec.ts`.
