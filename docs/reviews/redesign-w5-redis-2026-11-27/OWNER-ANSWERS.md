# Owner trả lời SPEC đợt 5 phần 1 — Redis/BullMQ (27/11/2026)

Nguồn câu hỏi: [SPEC.md](SPEC.md) §10 (bản 1). Quyết định của Owner, chưa báo GVHD/hội đồng. Áp vào SPEC bản 2, [ADR-DRAFT.md](ADR-DRAFT.md), [PLAN.md](PLAN.md).

| Mã         | Câu                                                                    | Quyết định                                                                                                                                            | Ngày       |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| OQ-W5R-1   | Đợt này làm tới đâu (`QĐ-118a` "BullMQ qua outbox khi còn thời gian")? | **A bản gọn.** Nhóm 1 bắt buộc: Redis prod + CI + rate-limit Redis. Nhóm 2: relay mail qua BullMQ bản gọn + Bull Board                                | 27/11/2026 |
| OQ-W5R-2   | Outbox chung hay bảng trạng thái từng loại việc?                       | **A** — tái dùng `email_outbox`; loại việc sau mỗi loại một bảng trạng thái có bộ cột relay                                                           | 27/11/2026 |
| OQ-W5R-3   | Redis chết thì mail làm sao?                                           | **A** — mail nằm lại outbox chờ Redis; có công tắc vận hành `BACKGROUND_JOBS_TRANSPORT=poll`                                                          | 27/11/2026 |
| OQ-W5R-4   | Rate-limit khi Redis chết?                                             | **A** — dự phòng bộ nhớ từng tiến trình; **dùng thư viện `@nest-lab/throttler-storage-redis`** bọc lớp dự phòng mỏng, không tự viết Lua               | 27/11/2026 |
| OQ-W5R-5   | Bull Board: ai xem, bảo vệ thế nào?                                    | **A** — `/ops/queues`, tắt mặc định qua env, chỉ đọc, Basic Auth tài khoản vận hành riêng, **so trên hash**, **không** đếm lần sai, **không** nới CSP | 27/11/2026 |
| OQ-W5R-6   | Sweeper có chuyển sang BullMQ?                                         | **A** — giữ trong API (ADR-0018)                                                                                                                      | 27/11/2026 |
| Người code | Ai làm đợt này?                                                        | **Bảo**, làn `tech` (có Docker), nhánh `feat/redesign-w5-redis` từ `origin/dev`                                                                       | 27/11/2026 |

Review độc lập bản 1 (RV-1 → RV-7) do điều phối chuyển cùng ngày; nội dung và chỗ áp ở [SPEC.md](SPEC.md) §14.
