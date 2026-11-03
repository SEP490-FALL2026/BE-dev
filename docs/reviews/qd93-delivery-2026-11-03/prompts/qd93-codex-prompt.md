Bạn tiếp quản việc implement BE SaaS-Sentry theo quyết định QĐ-93. Một phiên trước đã làm xong một phần; bạn làm TIẾP,
TUẦN TỰ, không làm lại phần đã commit.

## Repo và trạng thái lúc bàn giao (02/11/2026)
- Repo: D:\FPT\FALL2026\Code\BE-dev-software-license-management (NestJS + Prisma + PostgreSQL). Đọc AGENTS.md,
  CONTRIBUTING.md, test/README.md, docs/rules/*.md trước khi code.
- Spec/plan/test-plan từng hạng mục: docs/workspace/items/<slug>/{spec,plan,test-plan}.md — làm ĐÚNG plan, spec là nguồn.
- Chuỗi nhánh xếp chồng đã xong (mỗi nhánh tạo từ nhánh trước, chưa merge vào dev):
  1. feat/qd93-remove-hr-basis-org-writes            — DONE (164f6e67)
  2. feat/qd93-remove-in-app-super-admin-transfer     — DONE (7daf6856)
  3. feat/qd93-parameter-labels-dashboard-queues      — DONE (10e4a56d)
  4. feat/qd93-direct-manager-spending-approver-roles — ĐANG LÀM, HEAD 4043433f: xong Task 0.1, 0.2, 1–10.
     Còn lại theo plan.md của hạng mục này: Task 11 (ca đồng thời — file chưa commit
     test/integration/identity-access/direct-approval-roles-concurrency.integration-spec.ts là bản dở của Task 11: đọc,
     hoàn thiện hoặc viết lại), Task 12, Checkpoint 3, Task 13, 14, 15, Checkpoint cuối.
- Có một worktree rỗng D:\FPT\FALL2026\Code\BE-qd93-lane2 (nhánh feat/qd93-remove-department-projects tại 10e4a56d, chưa
  có commit nào). Kiểm lại: nếu đúng là không có commit/thay đổi nào thì `git worktree remove ../BE-qd93-lane2` và
  `git branch -D feat/qd93-remove-department-projects`, rồi tạo lại nhánh đó ở bước 5 bên dưới.
- Nhật ký phiên trước: D:\FPT\FALL2026\NOTE MD\qd93-implementation-progress.md (đọc để biết lệch spec/câu hỏi đã ghi).

## Thứ tự còn lại (mỗi hạng mục một nhánh, tạo từ nhánh của hạng mục ngay trước)
 4. qd93-direct-manager-spending-approver-roles — làm nốt (xem trên)
 5. qd93-remove-department-projects — CHỈ phase 1 (KHÔNG làm phase 2 drop bảng)
 6. qd93-remove-fallback-substitute-approvers — CHỈ phase A (KHÔNG làm phase B drop bảng, KHÔNG chạy lệnh chuyển đổi)
 7. qd93-unplaced-employee-first-placement — phase A–D
 8. qd93-code-format-xlsx-employee-import — phase A–C
 9. employee-directory-read
 10. qd93-budget-record-attachments
 11. dashboard-request-queues-wiring
Nhánh: feat/qd93-<slug> (slug đúng tên thư mục hạng mục).

## Giới hạn cứng
- Được commit LOCAL trên các nhánh feat/qd93-*; KHÔNG push, KHÔNG merge vào dev/main, KHÔNG deploy, KHÔNG chạy gì lên
  VPS/DB dùng chung; chỉ DB/Redis test local theo test/README.md. KHÔNG sửa repo D:\FPT\FALL2026\Docs.
- Coi 11 spec là `ready` (Owner đã duyệt). Điều kiện "hạng mục trước đã merged-dev" trong plan = "nhánh hạng mục trước đã
  xong và bộ kiểm nhanh xanh". KHÔNG sửa scripts/verify/merged-migrations.txt. Timestamp migration mới = thời điểm tạo
  (xếp sau migration mới nhất trên nhánh).
- Owner cho phép thêm `docs/examples/budget-attachments/files/** -text` vào .gitattributes (Task 9 của attachments).
- KHÔNG đổi phạm vi/nghiệp vụ của spec, KHÔNG tự thêm nghiệp vụ. Gặp điểm spec không phủ hoặc mâu thuẫn với code thật →
  ghi câu hỏi vào progress, chọn cách giữ nguyên hành vi hiện có nếu an toàn, hoặc dừng hạng mục đó và làm hạng mục
  không phụ thuộc nó. KHÔNG xóa/skip/nới test hay assertion để cho xanh; không eslint-disable/ts-ignore trái rule repo.
- Câu hỏi đã có, giữ nguyên cách đang làm: revoke vai trả 200 `ROLE.REVOKED` (không đổi sang 204); PATCH phòng ban body
  rỗng giữ 422 `DEPARTMENT.UPDATE_EMPTY`.

## Cách làm từng hạng mục
1. Tạo nhánh, đọc spec + plan + test-plan, làm từng Task theo thứ tự plan: viết test trước (đỏ), code cho xanh,
   commit theo task (message: "<slug> task <n>: <tóm tắt>").
2. Sau mỗi hạng mục chạy BỘ KIỂM NHANH (phải xanh trước khi qua hạng mục sau):
   pnpm typecheck · pnpm lint · pnpm arch:check · pnpm rules:check · pnpm test:gates · pnpm openapi:export (không
   drift / commit openapi.json nếu spec đổi contract) · unit/http/integration THEO FILE đã sửa hoặc liên quan.
   KHÔNG chạy `pnpm check` đầy đủ, KHÔNG chạy toàn bộ test:integration / test:e2e / test:integration:timing (Owner sẽ
   chạy khi audit).
3. Ghi bảng bằng chứng trong plan.md (chỉ kết quả thật đã chạy) và cập nhật progress:
   D:\FPT\FALL2026\NOTE MD\qd93-implementation-progress.md (hạng mục, nhánh, SHA cuối, task xong, lệnh + kết quả, lệch
   spec, câu hỏi). Bị ngắt thì đọc file này để làm tiếp.

## Khi xong hết (hoặc phải dừng)
Ghi MỘT báo cáo: D:\FPT\FALL2026\NOTE MD\qd93-implementation-report.md gồm:
1. Bảng 11 hạng mục: nhánh, nhánh cha, SHA cuối, trạng thái (done/partial/blocked).
2. Từng hạng mục: task xong/chưa, AC trong bảng Primary Story/AC đã có test hay chưa, lệnh đã chạy + kết quả thật.
3. Lệch spec (ở đâu, vì sao) và câu hỏi cần Owner quyết.
4. Migration mới (tên thư mục, theo hạng mục).
5. Ghi rõ: "pnpm check và test toàn bộ CHƯA chạy — Owner/Claude chạy khi audit".
Không ghi "xong/xanh" khi chưa có bằng chứng chạy thật.
