# Brief chung cho người viết spec/plan prompt 5 (chat điều phối "SEP-Start 122", 16–17/11/2026)

Tiếng Việt; giữ tiếng Anh cho code, route, field, mã lỗi, đường dẫn. Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`
(process: `agent-skills:spec-driven-development` + `agent-skills:planning-and-task-breakdown`; domain theo phần của bạn;
`superpowers:verification-before-completion`).

## Bối cảnh
- BE: `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `dev` @ `94a8ee84` (prompt 3 đã merge, đã deploy). **Chỉ đọc**,
  không sửa code, không chạy lệnh ghi git. Kiến trúc: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/**` (module, tầng, facade, arch
  tests, migration forward-only, enum `_values` riêng, `PRISMA_MODEL_OWNER`, quy ước test), `docs/roadmap.md`.
- Luật: sổ `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md` (QĐ mới nhất thắng) → BRD
  `D:\FPT\FALL2026\Docs\Requiments\BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md` → `Quy trình và chính sách theo
  main flow.md` → sơ đồ `D:\FPT\FALL2026\Docs\Diagrams\supporting-business-flows\`, `main-workflows-activity-diagram\`.
- Đầu vào phát hiện: `docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md` (phần đầu: Chờ Owner, 20 dòng lệch/nghi lỗi),
  `docs/reviews/fe-feedback-2026-11-11/audit-p3/apidocs/REPORT-A1…A6.md`, `REVIEW-R1.md`, `REVIEW-R2.md`, `GENERIC-ERRORS.md`,
  `D:\FPT\FALL2026\Code\verify-logs\ai-review\WDP.md`, `SEP.md`, `TOOL.md`. Tài liệu API FE:
  `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` (catalog/notifications.md, catalog/errors.md).

## Quyết định Owner đã chốt (16/11, không hỏi lại)
- Prompt 5 làm TRƯỚC prompt 4; chia 3 chat code (Sonnet): **5a** = sửa 4 lỗi Cao + email + BE cho tool + dọn tham số chết;
  **5b** = thông báo + lỗi (chạy SAU 5a); **5c** = AI (chạy song song 5a). Review/verify bằng Opus/Fable. Mục tiêu tổng ~10 giờ.
- Thông báo: BE trả `title`/`message` theo header `Accept-Language` (vi mặc định, en), ghép LÚC ĐỌC từ `code`+`params` (không lưu chữ),
  giữ `code`/`params`/`subject`, thêm `target`; chỉ API thông báo đọc `Accept-Language` (một interceptor/helper dùng chung).
- Lỗi: `message` GIỮ tiếng Anh; làm mã cụ thể + `details` có cấu trúc; FE hiện tiếng Việt theo catalogue.
- `loginEmail = workEmail` (A): tạo tài khoản luôn lấy email công việc, bỏ ô loginEmail riêng ở API tạo; đổi email đăng nhập vẫn là luồng
  bảo mật riêng.
- AI: BE gốc = nhánh `origin/Bao_dev_be` (AI_PROVIDER_MODE SIMULATED|MODEL); không MongoDB ở đồ án (QĐ-79c); tách interface lưu lịch sử
  AI để repo WDP gắn adapter MongoDB sau; AI service đồ án lấy thêm từ WDP prompt v4, kịch bản, eval. Model chạy Modal GPU. **US-15-06
  KHÔNG vào prompt 5** (bị chặn bởi US-12-14).
- FIX-AD1-Q2 = A (điều chỉnh ngân sách chỉ khi kỳ đã khóa — giữ code), FIX-PL2-Q1 = A (checklist lô có *Không* chỉ khóa APPROVE — giữ
  code). Mobile sửa ảnh/SĐT dùng chung API. Finance lấy danh sách phòng qua `budgetCycleBaseline` (không thêm route).
- Không push `dev`/`main`, không deploy; commit đứng tên git Owner, không dòng đồng tác giả AI.

## Đầu ra của bạn (một file trong `docs/reviews/p5-2026-11-17/`)
1. **Spec** phần của bạn: mục tiêu, hành vi hiện tại (file:dòng), hành vi đích theo QĐ/BRD (trích mã), contract API đổi (route, body,
   response, mã lỗi + details, thông báo), dữ liệu/migration (forward-only), phân quyền/SoD, ca biên, điều kiện xong kiểm được.
2. **Plan + task**: task nhỏ (≤ ~5 file mỗi task), thứ tự phụ thuộc, mỗi task: mục tiêu · file · test cần viết (unit/integration/http/
   flows) · lệnh kiểm · ước lượng giờ Sonnet. Đánh dấu task chạy song song được và file có nguy cơ xung đột với chat khác (5a/5b/5c).
3. **Câu hỏi Owner** (chỉ khi thật sự chưa có nguồn): mã · câu hỏi · A/B · khuyến nghị (A đứng đầu = ít sửa nhất mà đúng QĐ).
4. Ước lượng tổng giờ và phần nào có thể cắt nếu vượt 10 giờ.
Đừng viết code. Trích nguồn cụ thể. Giữ ngắn gọn, đủ để chat Sonnet code thẳng.
