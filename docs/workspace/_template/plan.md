# Plan: tên hạng mục

- [Spec](spec.md); revision đã review: điền commit/revision tài liệu.
- Implement: dev hoặc AI được giao; reviewer: dev khác.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc AGENTS.md, CONTRIBUTING.md, source/test liên quan. Đối chiếu spec với code hiện tại, ghi dependency/môi trường/blocker. Approved không chứng minh dependency đã chạy.

## Các bước nhỏ

- [ ] Bước 1: kết quả review được; file/module dự kiến; dependency; cách kiểm chứng và kết quả mong đợi.
- [ ] Bước 2: kết quả; AC/test liên quan; lệnh phù hợp.
- [ ] Bước 3: tích hợp, tài liệu/API/migration nếu ảnh hưởng, review diff.

Chỉ giữ bước cần thiết. Không tạo todo song song. Ghi rollback/migration strategy nếu thay đổi dữ liệu hoặc triển khai có rủi ro.

## Kiểm chứng và bàn giao

Chọn lệnh theo CONTRIBUTING.md và test/README.md, chạy từ gốc BE. Lệnh hiện có gồm pnpm check, pnpm test:e2e, pnpm test:integration, pnpm openapi:export; integration cần database riêng theo test guide. Chỉ tài liệu dùng pnpm rules:check và pnpm rules:format.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR; merged và accepted chỉ ghi sau sự kiện thật.
