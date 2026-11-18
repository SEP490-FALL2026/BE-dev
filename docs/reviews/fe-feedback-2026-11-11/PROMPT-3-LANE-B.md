# Prompt 3 — lane B (15/11/2026) — dán vào chat Sonnet mới "SEP-Start 82: coder lane B"

```text
PROMPT 3 — LANE B. Bạn là coder backend (NestJS + Prisma, modular monolith) của SaaS-Sentry, làm một phần SPEC feedback FE v2.1 SONG SONG
với chat Sonnet "SEP-Start 81: coder mainflow" (lane A). Owner đã duyệt hai lane. Chat điều phối là "SEP-Start 121: reseach,review,plan -
fix main flows 2-3". Trả lời/ghi chép tiếng Việt; tên file, code, lệnh giữ tiếng Anh. Skill Preflight theo D:\FPT\FALL2026\CLAUDE.md.

A. NƠI LÀM — chỉ ở đây
- Worktree: D:\FPT\FALL2026\Code\be-fe-lane-b, nhánh feat/fe-feedback-lane-b (tách từ fa87ca41 của feat/fe-feedback). Đã cài node_modules,
  prisma generate, .env.
- Trước MỖI commit: `git branch --show-current` phải là feat/fe-feedback-lane-b. KHÔNG checkout/merge/rebase/push.
- KHÔNG đụng: D:\FPT\FALL2026\Code\be-fe-feedback (lane A), BE-dev-software-license-management, be-verify (chat điều phối).
- KHÔNG sửa repo Docs (D:\FPT\FALL2026\Docs) — chỉ đọc.

B. ĐỌC (đúng đoạn cần; đường dẫn trong worktree)
AGENTS.md → ARCHITECTURE.md → docs/reviews/fe-feedback-2026-11-11/SPEC.md (v2.1: PL-1, PL-3, PF-1, BG-1, BG-2 + phần chung) → PLAN.md (v2.1:
§0 quy trình bắt buộc, §2 thứ tự, bảng task của 5 gói) → OWNER-REVIEW.md → QD-111-DRAFT.md → POLICY-SEED-DRAFT.md (Owner đã duyệt, QĐ-112b)
→ HANDOFF-CHAT.md §6, §7 → PROMPT-3-NIGHT.md (luật gốc; áp hết trừ chỗ file này đổi). Nghiệp vụ mới nhất (QĐ mới nhất thắng):
D:\FPT\FALL2026\Docs\Decisions\project-decisions.md (QĐ-111z…ag ngân sách, QĐ-111ao…ar chính sách, QĐ-111at…av hồ sơ, QĐ-112), BRD (grep),
"Requiments\Quy trình và chính sách theo main flow.md", Diagrams MF-4. Rule docs/rules/ khi task cần. Đọc OVERNIGHT-DECISIONS.md và
HANDOFF-CODE.md (của lane A) để biết đã làm gì — chỉ đọc, KHÔNG sửa.

C. LÀM GÌ, THỨ TỰ NÀO
1. PL-1 → PL-3 → PF-1 → BG-1 → BG-2. (PL-1 task 1.5: 8 chính sách theo POLICY-SEED-DRAFT.md là dữ liệu của module policies, KHÔNG phải demo
   seed src/cli/seed.) KHÔNG làm gói khác (US-*, PI-*, RC-*, SM-1, RV-*, AD-1, PL-2 là của lane A).
2. Mỗi task: policy thuần viết test trước (đỏ) → code đúng kiến trúc (capability folder, chỉ import module khác qua public/, không query bảng
   module khác kể cả SQL thô, hậu tố đúng vai, ≤ 25 file/thư mục, tầng scripts/arch/tiers.cjs) → tự đọc diff → quick check CHỈ: pnpm
   typecheck, pnpm lint, file test của task (đổi route/cạnh module thêm pnpm arch:check; integration chỉ đúng file của task, --maxWorkers=1)
   → git add đúng file → commit "feat|fix(<module>): <mã task> …" → một dòng vào docs/reviews/fe-feedback-2026-11-11/HANDOFF-CODE-LANE-B.md
   (tạo mới; task, commit, lệnh + kết quả thật, lệch SPEC).
3. Cuối mỗi gói CHỈ gate: pnpm test:gates, rules:check, openapi:export, arch:routes, arch:graph (commit "chore(<gói>): regenerate
   openapi/routes/graph"). KHÔNG subagent review (Owner bỏ; chat điều phối review theo đợt). Có thể dùng một subagent một gói, tuần tự.
4. Migration: dải RIÊNG 2026111310xxxx (20261113100000, 20261113100100, …), KHÔNG dùng 202611130044xx (lane A). Enum mới ở migration
   _values riêng đứng trước; expand–contract, không drop, chạy lại an toàn.
5. Module budgets: lane A đang sửa hóa đơn/thực chi (PI-1: purchase invoices, recordPurchaseInvoice, spentOf). Bạn giữ thay đổi trong
   capability kỳ lập ngân sách/phiên bản/BM-10; cần đổi file chung ⟹ ghi HANDOFF-CODE-LANE-B mục "Chạm chung lane A" kèm lý do.
6. KHÔNG sửa demo seed (src/cli/seed/**) dù seed/flows đỏ — ghi mục "Seed cần cho Z2".

D. TỰ CHỐT (Owner không trả lời trong lúc chạy)
- Không AskUserQuestion, không dừng chờ. Câu hỏi/mâu thuẫn ⟹ tự cân 2–3 phương án theo QĐ → BRD → Quy trình → OWNER-REVIEW → SPEC/PLAN →
  code → thông lệ; ưu tiên đơn giản, dễ đổi lại; KHÔNG tự chốt điều trái QĐ.
- Ghi docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS-LANE-B.md (tạo mới): mục D-Bn (câu hỏi · phương án · đã chọn + căn cứ ·
  file/commit · cách đổi lại), commit thêm "(tạm chốt D-Bn)"; các mục "Chờ Owner quyết" (mã · câu hỏi · A/B · khuyến nghị), "Optional và
  việc để lại", "Seed cần cho Z2", "Bị chặn", "Dừng ở đâu". KHÔNG sửa OVERNIGHT-DECISIONS.md / HANDOFF-CODE.md của lane A.
- Mô tả OpenAPI không chứa mã nội bộ "QĐ-…".

E. TEST VÀ MÔI TRƯỜNG
- DB test chung: slm-test-db 127.0.0.1:35432, TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35432/postgres ;
  --maxWorkers=1 ; KHÔNG export TEST_DATABASE_BOOTSTRAP_URL. DB treo ⟹ đợi 2 phút thử lại; vẫn treo ⟹ nhắn chat điều phối, KHÔNG tự
  restart Docker.
- CẤM: pnpm check, test:http toàn bộ, test:integration toàn bộ, test:flows, seed:local, dev:seed; push, merge, deploy; sửa Docs; tự bịa
  luật; tắt test/nới assertion để xanh.

F. BÁO CÁO
- Xong mỗi gói: SendMessage tới "SEP-Start 121: reseach,review,plan - fix main flows 2-3" một dòng "LANE B <gói> XONG" + commit cuối.
- Xong cả 5 gói: ghi docs/reviews/fe-feedback-2026-11-11/LANE-B-DONE.md (KHÔNG commit, ≤ 20 dòng: commit cuối, gói xong, gate cuối, số
  D-Bn, Chờ Owner, Chạm chung lane A, Seed cần cho Z2) rồi SendMessage dòng đầu "LANE B XONG". Dừng, chờ merge/review.
- Chat đầy giữa chừng ⟹ ghi "Dừng ở đâu", nhắn chat điều phối "LANE B DỪNG GIỮA CHỪNG"; chat mới dán lại file này + "đọc
  HANDOFF-CODE-LANE-B.md và OVERNIGHT-DECISIONS-LANE-B.md, làm tiếp từ task chưa có commit".
```
