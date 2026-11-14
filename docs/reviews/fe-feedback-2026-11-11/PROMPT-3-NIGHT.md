# Prompt 3 (bản 14/11/2026) — gửi chat Sonnet "SEP-Start 81: coder mainflow"

> Chat điều phối (SEP-Start 120) gửi nguyên văn khối dưới qua `SendMessage`. Thay cho "Prompt 3" cũ ở [SONNET-PROMPTS.md](SONNET-PROMPTS.md):
> chạy trên **nhánh riêng `feat/fe-feedback`** trong **worktree riêng** (Owner muốn giao `feat/mf2-mf3` sạch), thêm luật §6 của
> [HANDOFF-CHAT.md](HANDOFF-CHAT.md) và gói nhỏ `AUDIT-MF23` từ audit MF-2/MF-3.

```text
PROMPT 3 — sửa BE theo feedback FE (SPEC v2.1). Owner đang ngủ và đã cho phép chạy; chế độ chạy đêm (mục D).

A. NƠI LÀM — chỉ ở đây
- Worktree: D:\FPT\FALL2026\Code\be-fe-feedback, nhánh feat/fe-feedback, tách từ {BASE_SHA} (feat/mf2-mf3 sau audit). Chat điều phối đã cài sẵn
  node_modules, prisma generate, .env.
- Trước MỖI commit: `git branch --show-current` phải là feat/fe-feedback. KHÔNG checkout, merge, rebase hay push nhánh khác.
  KHÔNG đụng thư mục D:\FPT\FALL2026\Code\BE-dev-software-license-management (chat điều phối đang làm seed ở đó).
- KHÔNG sửa repo Docs (D:\FPT\FALL2026\Docs), kể cả API-Integration: tài liệu API FE làm ở lượt audit. Docs chỉ đọc, mốc main @ 5ef039c.
- Trả lời tiếng Việt; tên file, code, lệnh giữ tiếng Anh.

B. ĐỌC (đúng đoạn cần)
AGENTS.md → ARCHITECTURE.md → docs/reviews/fe-feedback-2026-11-11/SPEC.md (v2.1) → PLAN.md (v2.1, §0 là quy trình bắt buộc) →
OWNER-REVIEW.md (luật đã chốt, Owner giữ A hết) → QD-111-DRAFT.md → POLICY-SEED-DRAFT.md (Owner đã duyệt, QĐ-112b) → HANDOFF-CHAT.md §6.
Chỉ mở R8–R16, F1–F4, REVIEW-SPEC-*.md khi cần lý do. Rule ở docs/rules/ chỉ đọc khi task cần (bảng trong AGENTS.md).

C. LÀM GÌ, THỨ TỰ NÀO
1. Đúng thứ tự gói PLAN §2: FX-1 → … → PF-1, BỎ Z2 (pha cuối). SM-1 làm trước RV-1. PL-1 task 1.5 seed 8 chính sách theo
   POLICY-SEED-DRAFT.md (đã duyệt, không gắn "nháp demo").
2. Thêm gói AUDIT-MF23 (S, ngay sau IN-1), mỗi mục một commit, test đỏ trước:
   a. D-78 (QĐ-110i, QĐ-111bc): Request phần mềm nội bộ K5 (không có bước chi) đang chờ trưởng phòng mà phòng mất trưởng phòng
      (hết kỳ không kế nhiệm) ⟹ bước nhu cầu kết thúc NOT_REQUIRED lý do NO_DEPARTMENT_HEAD, gắn cờ NO_NEED_APPROVER, sang IT_EXECUTION
      như đường gửi mới (routeNeedStep). Request trả phí vẫn đứng chờ. Chỗ: requests/step-routing/ (reassignment.policy.ts:113 +
      StepReassignmentService). Test: integration department-head-loss.
   b. D-122(a), SoD-4: IT Admin chấp nhận/từ chối đề xuất danh sách phần mềm phòng do chính mình đề xuất ⟹ 403/409 có mã riêng
      (người đề xuất ≠ người duyệt). Chỗ: licensing/department-tools/ đề xuất (P18).
   c. IN-1 khi gọi facade LicensingDepartmentToolsApi.addDepartmentSoftwareFromCatalogLink PHẢI kiểm IT Admin có phạm vi phòng của Request
      trước (D-118, D-122c), ánh xạ lỗi DepartmentSoftwareNotInCatalog.
   KHÔNG làm các điểm còn chờ Owner (D-95, C-2/D-105, C-3/D-103, B-3, A-2) — xem docs/reviews/mf2-mf3-2026-11-10/AUDIT.md §3.2.
3. Mỗi task: policy thuần viết test trước (đỏ) → code đúng kiến trúc (capability folder, chỉ import module khác qua public/, không query
   bảng module khác, hậu tố file đúng vai, trần 25 file/thư mục, tầng scripts/arch/tiers.cjs) → tự đọc diff → quick check CHỈ:
   pnpm typecheck, pnpm lint, file test của task (đổi route/cạnh module thêm pnpm arch:check; integration chỉ đúng file của task) →
   git add đúng file của task → commit "feat|fix(<module>): …" → một dòng vào docs/reviews/fe-feedback-2026-11-11/HANDOFF-CODE.md
   (task, commit, lệnh + kết quả thật, lệch SPEC).
4. Cuối mỗi gói: pnpm test:gates, pnpm rules:check, pnpm openapi:export, pnpm arch:routes, pnpm arch:graph; một subagent review nhẹ chỉ đọc;
   sửa Critical/Required trước gói sau. Mô tả OpenAPI không chứa mã nội bộ QĐ-… (test openapi-presentation chặn).
5. Migration: số theo dải trong SPEC/PLAN (sau 20261113002700 đang có), giá trị enum mới ở migration _values riêng đứng trước,
   expand–contract, không drop, chạy lại an toàn.

D. CHẠY ĐÊM — SUBAGENT TUẦN TỰ
- superpowers:subagent-driven-development nhưng MỘT subagent MỘT gói, LẦN LƯỢT, không song song (gói phụ thuộc nhau, cùng
  HANDOFF-CODE.md/openapi.json, DB test chung). Chat chính chỉ điều phối: giữa hai gói kiểm git log, git status, dòng HANDOFF; subagent trả
  ≤ 15 dòng.
- KHÔNG dùng AskUserQuestion, không dừng chờ. Gặp câu hỏi/mâu thuẫn ⟹ tự cân 2–3 phương án, chọn theo thứ tự căn cứ
  QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ; ưu tiên đơn giản, dễ đổi lại (không xóa dữ liệu, không drop, không đổi contract
  khó lùi); KHÔNG tự chốt điều trái QĐ. Ghi docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md mục D-n (câu hỏi · phương án ·
  đã chọn + căn cứ · file/commit · cách đổi lại); commit message thêm "(tạm chốt D-n)". Task bị chặn ⟹ mục "Bị chặn", làm tiếp phần
  không phụ thuộc. Còn < 10% context ⟹ mục "Dừng ở đâu". Cuối file: "Tóm tắt cho Owner".

E. TEST VÀ MÔI TRƯỜNG
- DB test: Postgres container slm-test-db cổng 127.0.0.1:35432 (đang chạy, chat điều phối dùng chung):
  TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35432/postgres ; --maxWorkers=2 ; KHÔNG export
  TEST_DATABASE_BOOTSTRAP_URL. DB treo ⟹ đợi 2 phút thử lại; vẫn treo ⟹ nhắn chat điều phối, KHÔNG tự restart Docker.
- CẤM: pnpm check, test:http, test:integration toàn bộ, test:flows, seed:local (để audit/pha cuối); push, merge, deploy; sửa Docs;
  tự bịa luật; tắt test để xanh.

F. KHI XONG HOẶC DỪNG
Ghi docs/reviews/fe-feedback-2026-11-11/PROMPT3-DONE.md (KHÔNG commit, ≤ 20 dòng: commit cuối, gói xong/bị chặn, gate cuối, số D-n,
việc treo) rồi SendMessage tới "SEP-Start 120: reseach,review,plan - fix main flows 2-3", dòng đầu "PROMPT 3 XONG" (hoặc "PROMPT 3 DỪNG
GIỮA CHỪNG" + lý do). Rồi DỪNG, chờ audit.
```
