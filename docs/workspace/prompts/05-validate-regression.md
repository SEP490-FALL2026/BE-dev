# 05 — Validate API thật và regression cây cuối

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Sonnet theo cấu hình Owner.

## Prompt

Thực hiện **bước 05** trên code đã qua bước 04; chưa commit/push.

1. Đọc AGENTS/CONTRIBUTING/ARCHITECTURE, test guide và hướng dẫn harness, spec/plan/test matrix, findings và baseline.
   Xác nhận đúng cây cần kiểm chứng, dependency và ứng dụng/worker đang chạy đúng source. Nếu dùng dist CLI thì build
   cây đó trước. Không claim kết quả từ tiến trình cũ hoặc môi trường không biết revision.
2. Dùng PostgreSQL test riêng theo harness hiện hành và dữ liệu giả lập có đáp án. Không dùng DB/dữ liệu nhân sự thật.
   Validate luồng nghiệp vụ qua HTTP + PostgreSQL thật (E2E smoke hiện có hoặc kịch bản có thể tái lập); kiểm kết quả
   trả về lẫn trạng thái/persistence/audit và side effect liên quan. Dựng dữ liệu nền bằng builder/harness đúng ràng buộc.
3. Tầng HTTP contract chỉ kiểm wire/quyền/validate với repo/port giả khi cần; integration chứng minh SQL/constraints/
   rollback/khóa/concurrency; E2E smoke chứng minh hành trình thật. Đặt case đúng tầng, không ép mọi case đi qua HTTP.
   Bên ngoài như SMTP/storage/vendor phải ghi rõ thật/sandbox/mock và giới hạn; không tự gửi thông báo cho người thật.
4. Với bàn giao gói chức năng, chạy checklist regression trong README của bộ prompt theo package.json/test guide hiện
   hành: pnpm check; full HTTP contract; export OpenAPI; full integration; integration serial; E2E smoke. Thay đổi source,
   migration hay test trong lúc sửa thì quay kiểm tra phần bị ảnh hưởng; cần audit lại khi sửa có ý nghĩa. Không lặp
   full suite nếu cây không đổi và không có lỗi/rủi ro mới. Lát chỉ tài liệu theo gate tài liệu, không bật DB.
5. Nếu test đỏ: phân biệt regression, lỗi có sẵn và thiếu hạ tầng bằng bằng chứng, sửa phần được phép rồi verify lại.
   Không bỏ test/nới gate. Thiếu điều kiện thì ghi lệnh thất bại/chưa chạy, phần AC chưa validate và điều kiện gỡ;
   không tự ghi toàn gói verified. Chỉ dọn tài nguyên riêng của lượt mình và kiểm không để app/pool/DB riêng sót.
6. Ghi bảng kết quả vào Verification and handoff của plan (hoặc báo cáo liên kết): AC/kịch bản, lệnh, revision/fingerprint,
   môi trường, kết quả và giới hạn. Không đưa secret/token/raw dữ liệu cá nhân vào artefact. Baseline test có sẵn không
   phải kết quả mới chạy. Cây đổi sau kiểm chứng phải ghi phần bằng chứng cần chạy lại.

Đầu ra: AC đã validate/chưa validate, regression theo từng tầng, failures/blockers còn lại, migration/API ảnh hưởng
và handoff bước 06. Dừng sau bước 05. Owner vẫn cần kiểm revision tích hợp vào dev sau merge.
