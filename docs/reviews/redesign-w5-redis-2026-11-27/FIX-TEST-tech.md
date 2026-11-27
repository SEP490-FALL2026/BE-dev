# Nợ kiểm thử — Đợt 5 phần 1 Redis/BullMQ

| Gói | File test | Ca | Lý do |
| --- | --- | --- | --- |
| T3 | `test/integration/requests/step-reassignment.integration-spec.ts:196` | `touches neither a need step already approved` | CI [45971009063, shard 3](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45971009063/job/140411265865) nhận 403 khi kỳ vọng 201. Chạy lại đúng ca trên `origin/dev` `8c6ce1ff` với PostgreSQL Docker cũng nhận 403 tại cùng assertion. |

Shard 3 báo 42 suite lỗi và 202 test lỗi. Đã đối chiếu tái hiện một ca cụ thể ở trên. Các lỗi còn lại cần đối chiếu riêng từng ca. Job quality hết heap ở bước ESLint và được tăng heap runner trong T5 để kiểm lại ở C1.
