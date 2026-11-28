# Nợ kiểm thử — Đợt 5 phần 1 Redis/BullMQ

| Gói | File test | Ca | Lý do |
| --- | --- | --- | --- |
| T3 | `test/integration/requests/step-reassignment.integration-spec.ts:196` | `touches neither a need step already approved` | CI [45971009063, shard 3](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45971009063/job/140411265865) nhận 403 khi kỳ vọng 201. Chạy lại đúng ca trên `origin/dev` `8c6ce1ff` với PostgreSQL Docker cũng nhận 403 tại cùng assertion. |
| C2 | `test/integration/devices/devices-acknowledgement.integration-spec.ts:325` | W2-07 (b), (c), (e) | Chạy lại trên nền `8c6ce1ff` với PostgreSQL Docker. Fixture cập nhật `work_state` và vi phạm CHECK `employees_work_state_matches_status`. |
| C2 | `test/integration/catalog/shared-pool-subscription-http.integration-spec.ts:223` và `:313` | R-E03 và F-009 | Chạy lại trên nền `8c6ce1ff` với PostgreSQL Docker. Hai ca PATCH kỳ vọng 200 và nhận 422. |

Shard 3 báo 42 suite lỗi và 202 test lỗi. Đã đối chiếu tái hiện một ca cụ thể ở trên. Các lỗi còn lại cần đối chiếu riêng từng ca. Job quality hết heap ở bước ESLint và được tăng heap runner trong T5 để kiểm lại ở C1.

C1 [45974186752](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45974186752) đã qua quality, HTTP, in-band và e2e-smoke. Ba shard integration báo lần lượt 39, 32 và 42 suite lỗi. `step-reassignment` lặp lại ở shard 3. `redis-harness`, `redis-rate-limit` và `redis-client-pause` đều qua.

Lượt tái hiện thêm trên nền chạy đúng hai suite catalog và devices ở trên. Kết quả 23 ca xanh, 3 ca đỏ. Mỗi lỗi còn lại cần đối chiếu riêng trên nền.

C2 lượt đầu [45981006981](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45981006981) có cùng 113 suite lỗi với C1 và cùng số ca lỗi theo shard, lần lượt 255, 159 và 202. Các spec mới `email-queue-delivery`, `email-queue-relay`, `nightly-maintenance` và `queue-board` đều xanh.

C2 sau D-9 [45981659449](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45981659449) lặp lại cùng danh sách 113 suite lỗi và cùng số ca lỗi trên cả ba shard. Log xác nhận các spec của đợt chạy và xanh. Ba suite có ca đã tái hiện trên nền được liệt kê ở trên.
