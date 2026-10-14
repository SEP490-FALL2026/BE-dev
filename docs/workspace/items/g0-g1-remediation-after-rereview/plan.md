# Kế hoạch sửa lỗi G0, lát 1a và 1b

Liên kết: [spec](spec.md) · [báo cáo review](../../../reviews/g0-g1-remediation-2026-10-15/README.md).

## Trạng thái thực hiện

| Nhóm việc           | Trạng thái                  | Kết quả                                                                       |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| N-1, R-02, N-2, N-5 | Đã implement trên nhánh sửa | Loại client timeout khỏi pool, đóng pool đúng lifecycle, map lỗi availability |
| R-15, R-12          | Đã implement trên nhánh sửa | `/me` và readiness trả 503 theo contract                                      |
| R-03, N-3, N-6      | Đã implement trên nhánh sửa | Truy vấn candidates không còn trần 5.000; ký tự tìm kiếm được xử lý literal   |
| R-14, R-09          | Đã implement trên nhánh sửa | Snapshot page/count; tránh Argon2 không cần thiết                             |
| R-13                | Đã implement trên nhánh sửa | CLI chỉ dùng cấu hình CSDL; API/worker vẫn fail closed                        |
| N-4                 | Đã cập nhật                 | Tài liệu runtime và OpenAPI đồng bộ với code                                  |
| Review của dev      | Chưa có                     | Không ghi approved/accepted trước khi có người review thật                    |
| Merge vào `dev`     | Đã có                       | `a0cf5f1` đã vào `origin/dev` qua PR #7 và #8                                 |

## Kiểm chứng và review sau merge

- [x] `pnpm check` trên checkout sạch.
- [x] E2E và OpenAPI không drift.
- [x] Integration với PostgreSQL 17 bằng role không phải superuser.
- [x] Live smoke đủ 16 operation và worker/SMTP sink.
- [x] D1/D4 cho DB pause/stall và `/me` 503.
- [x] Mutation cho các finding đã sửa.
- [x] Docker build, Compose và dependency audit.
- [ ] Khép lỗi teardown hiếm của harness integration hoặc ghi disposition được dev review.
- [ ] Dev khác review diff và các lựa chọn facade/timeout.
- [x] PR đã merge vào `origin/dev`.

Kết quả số lượng test, revision và giới hạn môi trường được giữ ở
[báo cáo review](../../../reviews/g0-g1-remediation-2026-10-15/README.md), không sao chép evidence thô vào workspace.

## Sau khi merge

1. Dev A cập nhật từ `dev` trên checkout sạch.
2. Thực hiện lát 1c và Audit Trail theo spec/plan riêng.
3. Chỉ bắt đầu phần G2 phụ thuộc R-10/R-11 sau khi nguồn Docs được pin và review.
4. Không tái sử dụng prototype hoặc patch trong lịch sử; source trên nhánh đã merge là nguồn thực thi duy nhất.
