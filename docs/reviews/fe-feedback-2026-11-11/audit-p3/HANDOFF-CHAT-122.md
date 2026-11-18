# Bàn giao chat điều phối "SEP-Start 122" → chat Opus mới (17/11/2026)

Đọc trước: `D:\FPT\FALL2026\CLAUDE.md` (tiếng Việt, Skill Preflight), memory `project_prompt3_finish_decisions_2026_11_16.md`
(toàn bộ quyết định Owner 16–17/11), `feedback_*` trong MEMORY.md. Owner hiện đang thức; khi Owner nói "chạy xuyên đêm" thì làm theo
chế độ đêm (tự merge/verify, không push `dev`/`main`, không deploy).

## 1. Đã xong (16–17/11)
- **Prompt 3 xong, đã deploy:** BE `dev` @ `94a8ee84` (PR 54), VPS đã dọn DB + seed lại (exit 0, 64 bước; DEMO-14 cần `seed.sh --continue`
  ngày demo). Biên bản: BE `docs/reviews/fe-feedback-2026-11-11/AUDIT.md`, phần đầu `OVERNIGHT-DECISIONS.md` (59 Chờ Owner, 20 lệch BRD).
- **Tài liệu API FE + Mobile:** Docs `main` tới `dbced76` (đã có các commit 94f8b68…dbced76; Owner push dần). `--check` 0 vấn đề, revision =
  `dev` 94a8ee84 đã deploy. Câu trả lời FE: `D:\FPT\FALL2026\NOTE MD\noteFE.md`.
- **Tool collector:** đã đẩy lên repo `WDP301-FA26-GR8/Tool-service` (`D:\FPT\FALL2026\Code\Tool-wdp`, commit `303db74`, `0c022f8`),
  930 test xanh trên clone sạch, hướng dẫn `QUICKSTART-TEST.md` (thứ tự dựng dữ liệu server: allowlist TRƯỚC xác nhận). BE còn thiếu: route
  dừng thu thập, lệch allowlist theo ngày ⟹ chat A2 của prompt 5.
- **AI:** quyết định Owner: **AI service = bản WDP** (`WDP301-FA26-GR8/AI-service`, Qwen3.5-4B Q4_K_M, Modal L4) cho **cả hai BE**, lâu dài.
  Owner tự deploy Modal (lệnh đã đưa: clone sạch → `uv sync` → `modal setup` → `modal secret create saas-sentry-ai AI_SERVICE_TOKEN=…` →
  `modal run modal_app.py::download_model --model qwen3.5-4b-q4_k_m` → `AI_DEMO_WARM=1 modal deploy modal_app.py`; VPS `.env.app`:
  `AI_SERVICE_BASE_URL`, `AI_SERVICE_TOKEN`, `AI_SERVICE_TIMEOUT_MS=120000`; Super Admin bật `AI_ENABLED`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED`;
  sau prompt 5 thêm `AI_PROVIDER_MODE = MODEL`). Review AI: `Code/verify-logs/ai-review/{SEP,WDP,TOOL}.md`.

## 2. Prompt 5 — spec/plan xong, CHƯA code
Thư mục BE `docs/reviews/p5-2026-11-17/` (chưa commit): `SPEC-BRIEF.md`, `PLAN.md` (tổng, đã ghi mọi quyết định Owner), `SPEC-5A-SBF20.md`,
`SPEC-5A-FIXES.md`, `SPEC-5B-MESSAGES.md`, `SPEC-5C-AI.md`, `REVIEW-SPECS.md` (review 1, đã áp).
- Owner chốt **theo khuyến nghị toàn bộ** (S20-Q4 = 3 tham số 7/30/7; Q-5A-1 = một thông báo mỗi lô; còn lại A); lỗi theo thông lệ (giữ
  `VALIDATION_ERROR {code,path}`, `MONEY_*` có `details.path`, details cho 15 mã, khai mã thật trong OpenAPI, **không** đổi status/mã);
  chat C **chỉ BE** (C1–C5), bỏ S1–S6.
- **Review 2 cho SPEC-5A-FIXES/5B/5C: XONG** (`REVIEW-SPECS-2.md`, đã sửa 3 Critical thẳng vào spec, PLAN đã cập nhật giờ). Còn hỏi Owner **A2-12** (chặn 2 route ghost seat theo phòng? khuyến nghị: không, 4b). **Đang chạy lúc bàn giao:** review 2 SPEC-5A-SBF20 ⟹ `REVIEW-SPECS-2-SBF20.md` (agent sửa thẳng spec).
- **Việc kế tiếp 1:** review lần 2 **SPEC-5A-SBF20** (Owner đã đọc giải thích SBF-20 và đồng ý review). Nguồn: Docs `Diagrams/supporting-business-flows/
  SBF-20-software-stock-subscription-management.md`, QĐ-103e/q/v, 104d/k, 106i, 111o, BRD FR-1.12, FR-8.2. Lưu ý Q1 = A (nối dòng kỳ mới,
  lệch chữ QĐ-106i(3) "cùng dòng" vì INV-01 — đã giải thích Owner).
- **Việc kế tiếp 2:** tạo worktree/nhánh theo PLAN §2 (`feat/p5-a1-sbf20`, `feat/p5-a2-fixes`, `feat/p5-b-messages`, `feat/p5-c-ai` từ `dev`;
  dải migration A2 `20261117100000+`, A1 `…110000+`, C `…120000_ai_provider_mode`), viết prompt cho từng chat (mẫu: `FIX-TEST-PROMPT.md`,
  `Z2-PROMPT.md` trong `Code/verify-logs`), gửi, ping 90 phút, merge A2 → A1 → C → B vào `feat/p5`, CI GitHub (`gh workflow run ci.yml --ref
  feat/p5`, push nhánh tính năng được phép) + `test:flows` + seed DB trống, verify, viết changelog FE, sinh lại tài liệu API.

## 3. WDP — ƯU TIÊN (hội đồng WDP sau 2 ngày)
Owner muốn **xong WDP trước**: BE WDP = BE đồ án + **adapter MongoDB** cho lịch sử AI.
- Repo `D:\FPT\FALL2026\Code\BE-WDP` (`WDP301-FA26-GR8/BE`, `dev` @ `f2131ec2`); nhánh AI của bạn WDP `origin/feat/AI-services` (MongoDB lưu
  lịch sử AI qua outbox `ai_history_deliveries` + worker; review `ai-review/WDP.md`: chất lượng tốt, **2 lỗi chặn**: CI không có MongoDB
  (harness bắt `TEST_MONGODB_URI`), `docker-compose.prod.yml` không có MongoDB/`MONGODB_*` trong khi API/worker không khởi động thiếu
  `MONGODB_URI`; migration xóa `ai_invocation_contents` không quay lại được).
- Đề xuất nhanh cho demo WDP (chưa chờ prompt 5): (1) so `BE-WDP dev` với BE đồ án `dev` 94a8ee84, chép phần còn thiếu của prompt 3 sang
  WDP (Owner vẫn copy tay — hỏi Owner cách copy quen dùng); (2) merge `feat/AI-services` vào nhánh WDP mới; (3) sửa 2 lỗi chặn: thêm service
  MongoDB vào `.github/workflows/ci.yml` (job integration ai-assist) và `docker-compose.prod.yml` (+ env, volume, healthcheck, mật khẩu);
  (4) CI xanh trên repo WDP; (5) Owner deploy WDP + Modal (cùng AI service). Sau khi prompt 5 xong ở đồ án: copy lại, đặt adapter MongoDB
  sau port `AiInvocationHistoryStore` (SPEC-5C-AI §A2).
- Hội đồng WDP có thể cần seed demo + tool (Tool-service đã ở org WDP).

## 4. Chat nên mở (đề xuất cho Owner)
| Chat | Model | Việc |
| ---- | ----- | ---- |
| Điều phối mới | Opus | tiếp quản file này |
| WDP-1 (ưu tiên) | Sonnet | đồng bộ BE-WDP + merge feat/AI-services + sửa CI/compose MongoDB |
| P5-A1 SBF-20 | Sonnet | SPEC-5A-SBF20 |
| P5-A2 fixes | Sonnet | SPEC-5A-FIXES (lõi trước) |
| P5-B messages | Sonnet | SPEC-5B-MESSAGES (Phase N ngay; Phase E sau khi A2 merge) |
| P5-C AI-BE | Sonnet | SPEC-5C-AI C1–C5 |
Owner thích chat riêng hơn subagent cho việc code dài (memory). Nếu máy yếu: chạy WDP-1 + A2 + A1 trước, B và C sau.

## 5. Môi trường và quy ước
- BE một thư mục: `Code/BE-dev-software-license-management` (đang ở `dev`); worktree cũ đã gỡ. Docker: `slm-test-db` 35432, `-b` 35433
  (DB demo `slm_z2_local`), `-c` 35434 (tmpfs), `redis-server`, `slm-z2-s3` (SeaweedFS). Dựng DB test: script `make-test-db.sh` ở scratchpad
  chat 122 (`C:\Users\Asus\AppData\Local\Temp\claude\cb9d99d994b36370\c27266ac-740e-4502-b0ab-d8e5058375d3\scratchpad\`) — chép sang scratchpad mới.
- Commit đứng tên git Owner ("Chill"), **không** dòng đồng tác giả AI. Push chỉ nhánh tính năng để chạy CI; không push `dev`/`main`, không deploy.
- Docs: commit `main`, không push. Đồng bộ câu chữ BRD/QĐ **chờ Owner nói "đồng bộ"**: FR-5.18(3) (điều chỉnh khi kỳ khóa), QĐ-111aq/BR-MF1-07
  (checklist lô), ngoại lệ QĐ-61d (mobile đổi ảnh/SĐT), và các QĐ của prompt 5.
- Tài liệu API: generator `Docs/Figma UI-UX/API-Integration/tools/build-api-docs.mjs --be <BE> [--check]`; annotations/glossary/flows/roles/catalog viết tay.
- Bỏ qua: Owner không làm BullMQ; US-15-06 ngoài prompt 5.

## 6. Bổ sung 17/11 (sau khi chat 123 nhận)
- **Quyền Owner cấp thêm:** chat điều phối và các chat code được **push nhánh tính năng và chạy/sửa CI trên GitHub cho CẢ HAI repo BE**
  (`SEP490-FALL2026/BE-dev` và `WDP301-FA26-GR8/BE`), commit đứng tên git Owner (Chill), không dòng đồng tác giả AI; được chạy Docker tùy ý
  để test. Vẫn **không** merge/push `dev`/`main`, không deploy khi Owner chưa bảo.
- Review 2 SPEC-5A-SBF20 đang chạy trong chat 122 ⟹ `REVIEW-SPECS-2-SBF20.md` (agent sửa thẳng spec); chat 86 (A1) nên đọc file đó trước khi code.
- **SBF-20 ảnh hưởng FE theo vai:** IT Admin (form điều chỉnh mới một lần ghi, trang kho K2/K4, xem trước số seat cần, hủy kèm 2 ô xác nhận,
  thông báo mới); trưởng phòng (bỏ màn/tab xác nhận gia hạn); Finance (thông báo kết quả + cảnh báo đỏ, hết 403 danh sách sự kiện hạn chót);
  Người duyệt chi (chỉ thông báo sự cố tự gia hạn); Super Admin (3 tham số mới 7/30/7 ở màn tham số).
- **Seed:** bước seed không gọi route gia hạn (không phải sửa seed vì SBF-20); nhưng flows `test/flows/mf5-rightsizing*.flow-spec.ts`,
  `f0-auth-roles.flow-spec.ts` gọi route cũ ⟹ chat A1 phải viết lại; migration đóng ca `PROPOSED` cũ thành `STALE` ⟹ **seed lại VPS** sau deploy
  prompt 5 cho dữ liệu demo sạch (có thể thêm một DEMO kho K2 ở điểm điều chỉnh nếu kịp).
- **Owner 17/11 — luồng repo và deploy:** VPS hiện **deploy từ repo WDP (`WDP301-FA26-GR8/BE`), nhánh `main`**; khi xong môn WDP mới chuyển hẳn
  sang repo đồ án. Quy trình: làm xong BE đồ án (prompt 5) ⟹ **push nhánh lên repo đồ án** (Owner merge vào `dev`) ⟹ **copy sang BE-WDP**,
  làm adapter MongoDB (sau port `AiInvocationHistoryStore`) ⟹ **push nhánh lên repo WDP** ⟹ Owner merge vào `dev` rồi `main` ⟹ deploy.
