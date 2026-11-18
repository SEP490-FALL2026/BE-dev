# 03 — Implement source và test theo thiết kế

Dùng với tin giao việc và đầu vào tại [hướng dẫn](README.md). Khi dùng AI: Sonnet theo cấu hình Owner.

## Prompt

Thực hiện **bước 03** cho hạng mục/task được chỉ định, chưa commit/push.

1. Nạp AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rules liên quan và test guide tại checkout hiện tại. Đọc spec/plan,
   test design, findings bước 02 và source/test liên quan. Kiểm tra nhánh/diff và dependency. Nếu baseline đổi làm sai
   thiết kế/review, ghi tác động và sửa thiết kế đúng phạm vi hoặc trả câu hỏi cần Owner trước phần phụ thuộc.
2. Đi từng task/phase theo plan, implement cả product source và test hành vi. Test phù hợp được viết trong lúc làm,
   bug fix có ca tái hiện; không đợi code xong toàn bộ mới thiết kế test. Dùng harness/tầng test hiện hành, không dựng
   app/DB ở unit hoặc nhồi mọi case vào E2E. Không query bảng module khác; theo public API, tiers và extension points hiện có.
3. Chạy kiểm tra trọng tâm tại mỗi checkpoint; sửa nguyên nhân lỗi. Không tắt test/nới gate/sửa fixture chỉ để xanh.
   Thay đổi code làm rõ thiết kế thì cập nhật spec/plan/test design đồng thời; đổi nghiệp vụ cần Owner, không tự suy.
4. Đồng bộ generated artefact bằng generator khi thay HTTP/module/source graph; cập nhật API manifest, module card,
   runbook và migration theo tác động. Chỉ sửa file trong scope; giữ thay đổi có sẵn của người khác.
5. Tự review diff theo AC, cập nhật checklist/verification tại plan với lệnh, kết quả, revision/fingerprint và giới hạn.
   Theo CONTRIBUTING và mức kiểm tra của bước này; regression toàn gói cuối ở 05. Chưa đủ hạ tầng/đáp án thì ghi phần
   chưa chứng minh, không báo “xong” chỉ vì build xanh.

Đầu ra: hành vi đã implement, AC đã có/chưa có bằng chứng, file và migration/API đổi, tests đã chạy, findings/blocker
và đầu vào bước 04. Dừng sau bước 03 để người dùng chọn phiên/model audit implementation.
