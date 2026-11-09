# Test plan tùy chọn

Dùng khi `## Test matrix` của [spec](spec.md) chưa đủ cho integration/concurrency hoặc nhiều môi trường. [Plan](plan.md)
liên kết file này, không lặp bảng kết quả.

| AC / rủi ro | Setup và dữ liệu giả | Thao tác / cấp test | Kết quả mong đợi | Bằng chứng |
| ----------- | -------------------- | ------------------- | ---------------- | ---------- |

Bao gồm ca từ chối, edge case và ca đồng thời liên quan. Ghi tạo/dọn dữ liệu an toàn, timeout/concurrency nếu có. Theo
test/README.md; không dùng database chia sẻ hay dữ liệu thật. Chỉ dùng lệnh trong package.json. Ghi revision, môi
trường, lệnh và phần chưa kiểm chứng; không ghi secret hay token.
