Bạn là NGƯỜI ĐIỀU PHỐI tiếp quản việc implement BE SaaS-Sentry theo QĐ-93, chạy không giám sát. Bạn KHÔNG tự viết code
và KHÔNG tự đọc diff/log dài: giao subagent, chỉ đọc báo cáo ngắn (≤300 từ) của subagent và file tiến độ.

## Đọc trước
1. D:\FPT\FALL2026\NOTE MD\qd93-codex-prompt.md — luật, giới hạn cứng, thứ tự, cách làm từng hạng mục, báo cáo cuối.
   Áp NGUYÊN VĂN, cộng các bổ sung dưới đây (bổ sung thắng khi khác).
2. D:\FPT\FALL2026\NOTE MD\qd93-implementation-progress.md — nhật ký các phiên trước (Claude, Codex).
3. Repo D:\FPT\FALL2026\Code\BE-dev-software-license-management: AGENTS.md, CONTRIBUTING.md, test/README.md.

## Trạng thái lúc bàn giao (02/11/2026, Codex hết lượt)
- Xong: #1 feat/qd93-remove-hr-basis-org-writes 164f6e67 · #2 feat/qd93-remove-in-app-super-admin-transfer 7daf6856 ·
  #3 feat/qd93-parameter-labels-dashboard-queues 10e4a56d · #4 feat/qd93-direct-manager-spending-approver-roles 99b7234e.
- Đang làm: #5 feat/qd93-remove-department-projects (phase 1), HEAD c3ab636f — xong 1A.1, 1A.2, 1B.1, 1B.2. Working tree có
  12 file CHƯA commit (openapi.json, docs/generated/*, gate api-collection/policy-ownership, registry/manifest test support,
  openapi-presentation/read-wording http spec) = phần dở của 1B.3 (gate/registry/OpenAPI). Việc đầu tiên: subagent đọc
  plan #5 Task 1B.3 + `git diff`, hoàn thiện/sửa, chạy bộ kiểm nhanh, commit; rồi làm nốt phase 1 của #5 (không làm phase 2).
- Còn lại sau #5: #6 qd93-remove-fallback-substitute-approvers (CHỈ phase A) → #7 qd93-unplaced-employee-first-placement
  (A–D) → #8 qd93-code-format-xlsx-employee-import (A–C) → #9 employee-directory-read → #10 qd93-budget-record-attachments
  → #11 dashboard-request-queues-wiring. Mỗi hạng mục một nhánh feat/qd93-<slug> tạo từ nhánh hạng mục ngay trước.

## Bổ sung của Owner (thắng qd93-codex-prompt.md khi khác)
- TEST CỦA TÍNH NĂNG BỊ GỠ: ĐƯỢC PHÉP (và bắt buộc) thay/xóa test và assertion của tính năng mà SPEC yêu cầu gỡ (route,
  trường, enum, mã lỗi, vai, luồng bị bỏ: projects/projectLabel, approval-roles, FALLBACK_APPROVER, CONFLICT_SUBSTITUTE,
  waitingReason/hint cũ, hrBasis, super-admin-transfers…), mỗi test gỡ phải có test thay chứng minh hành vi mới (404,
  trường không còn, body cũ 422…), ghi ánh xạ "test cũ → test mới" vào bảng bằng chứng của plan. VẪN CẤM xóa/skip/nới test
  của hành vi spec GIỮ NGUYÊN để cho xanh.
- SPEC LỆCH HÀNH VI CODE CÓ TỪ TRƯỚC (mã HTTP, tên field…): giữ hành vi code, ghi vào progress, làm tiếp (vd. grant role
  201, revoke 200 `ROLE.REVOKED`, PATCH phòng ban rỗng 422 `DEPARTMENT.UPDATE_EMPTY`).
- KIỂM SAU MỖI HẠNG MỤC: chỉ bộ kiểm nhanh — pnpm typecheck · pnpm lint · pnpm arch:check · pnpm rules:check ·
  pnpm test:gates · pnpm openapi:export (không drift) · unit/http/integration THEO ĐƯỜNG DẪN FILE cụ thể (không dùng bộ
  lọc -t/pattern có thể kéo cả thư mục). KHÔNG chạy pnpm check, toàn bộ test:integration/test:e2e/timing.
- CHẠY LIỀN MẠCH tới hết #11; không dừng để báo cáo giữa chừng. Chỉ dừng khi: xong #11; gặp quyết định NGHIỆP VỤ mà
  spec/QĐ không có và không còn hạng mục nào làm được; lỗi hạ tầng không tự khắc phục.

## Subagent (luôn truyền model + effort khi gọi Agent)
- Implement và sửa lỗi: model `sonnet`, effort `high`. Hạng mục nặng (#6, #7, #8, #10): MỖI Phase của plan một subagent
  implement riêng, bàn giao qua commit cuối + progress file (tránh chết giữa chừng vì hết context).
- Verify bằng subagent KHÁC, model `opus`, effort `high`, CHỈ cho #6, #7, #10 (đối chiếu task trong plan, AC trong bảng
  Primary Story/AC có test, thử đột biến 1–2 chỗ quan trọng để chứng minh test bắt lỗi). Các hạng mục khác chỉ bộ kiểm nhanh.
- Không chạy giai đoạn review cuối và test toàn bộ — Claude ở chat audit sẽ làm.

## Kết thúc
Cập nhật progress sau mỗi hạng mục. Xong #11: viết lại D:\FPT\FALL2026\NOTE MD\qd93-implementation-report.md đầy đủ cho
cả 11 hạng mục theo mẫu trong qd93-codex-prompt.md, ghi "pnpm check và test toàn bộ CHƯA chạy — Claude chạy khi audit",
kèm bảng "test cũ → test mới" của các hạng mục gỡ tính năng. Không push, không merge.
