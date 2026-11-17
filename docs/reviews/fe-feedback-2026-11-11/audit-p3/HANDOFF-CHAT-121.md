# Bàn giao chat điều phối 121 → chat điều phối mới (16/11/2026)

Đọc trước: D:\FPT\FALL2026\CLAUDE.md (tiếng Việt, Skill Preflight) · BE `docs/reviews/fe-feedback-2026-11-11/HANDOFF-CHAT.md` bản 3 (§1 luật Owner, §5 test, §6 luật Sonnet, §7 chuẩn review) · memory `project_fe_feedback_2026_11_11.md`, `feedback_batch_review_depth.md`, `feedback_logic_now_tests_later.md`, `feedback_model_roles.md`, `feedback_full_ci_before_done.md`.

## 1. Trạng thái
- Chỉ còn chat code **"SEP-Start 81: coder mainflow"** (Sonnet), worktree `D:\FPT\FALL2026\Code\be-fe-feedback`, nhánh `feat/fe-feedback` (local, chưa push). Lane B (chat 82) đã xong, đã merge (b5d041c6, 134a713d).
- Gói code cuối: **PL-2** (checklist bảy bước QĐ-112a: 1.2, 1.3, 1.6, 1.7, 4.7, 5.3, 5.4 — D-103: AD-1 và ký kỳ RV KHÔNG gắn). Chat 121 review PL-2 + FIX + verify trước khi bàn giao (xem dòng cuối file này).
- Mọi gói khác đã code + review + FIX + verify: FX, RQ, XY, CT, IN-1, AUDIT-MF23, IA-1/2, K1-GR(+S), CO-1, US-1/2, PI-1/1c/2, RC-1/2, PL-1/3, PF-1, BG-1/2, SM-1, RV-1/2/3, AD-1 (biên bản: `D:\FPT\FALL2026\Code\verify-logs\AUDIT-*.md`).
- DB test: lane A `slm-test-db` 127.0.0.1:35432; điều phối `slm-test-db-c` 35434 (tmpfs — dựng lại sau mỗi lần restart Docker bằng scratchpad `make-test-db.sh` hoặc theo `.github/actions/test-database`). Docker engine đã treo (500) hai lần ⟹ `docker desktop restart` + `docker start slm-test-db redis-server`.
- Bản checkout sạch để verify: `D:\FPT\FALL2026\Code\be-verify` (detached). Script verify: lấy file chạm của dải commit, chạy tsc/unit/integration/http (`--maxWorkers=2` — 3 bị quá tải).

## 1b. PL-2 (cập nhật 16/11 ~13:30)
- PL-2 code xong (HEAD a393f174, chat 81 báo "PROMPT 3 XONG"); chat 121 review (AUDIT-PL2.md) + test (file chạm + test:http 111/2553 xanh) ⟹ đã gửi **FIX-PL2** (PL2-01 checklist 1.6 ở POST /spend-batches, PL2-03, 05, 07, 09, 10, 11, 12, PL2-08 nếu cỡ S). **FIX-PL2 XONG và ĐÃ VERIFY bởi chat 121** (HEAD 1f7ffa19; code tới 125683e5: test chạm unit 11/int 57/http 29 xanh; mutation tắt chấm checklist lô bị bắt; guard thiếu checklist trong service là đột biến tương đương vì DTO refine chặn trước). Chat mới bắt đầu ngay từ mục 2 (full CI). Chờ Owner mới: FIX-PL2-Q1/Q2/Q3; D-n kế tiếp D-111.

## 2. Việc còn lại của prompt 3 (chat mới làm)
1. **Full CI** sau commit cuối, đủ job `ci.yml` (`pnpm check` gồm bước drift Prisma, `test:http`, `test:integration` toàn bộ, `test:integration:serial` với `TEST_DATABASE_BOOTSTRAP_URL` chỉ cho lệnh đó, `test:e2e`) + `test:integration:timing`; flows/`seed:local` sẽ đỏ (seed → Z2) — ghi rõ. Suite đỏ do tải ⟹ chạy lại riêng `--maxWorkers=1`.
2. **FIX-TEST** một gói cho chat 81: danh sách `D:\FPT\FALL2026\Code\verify-logs\FIX-TEST-LIST.md` + mục "Nợ test cho FIX-TEST" trong `OVERNIGHT-DECISIONS.md`/`-LANE-B.md` + những gì full CI lộ ra (không phải lỗi logic).
3. **Gộp** `OVERNIGHT-DECISIONS-LANE-B.md` vào `OVERNIGHT-DECISIONS.md`; tóm lên ĐẦU file một bảng **mọi điểm Chờ Owner** (mã · câu hỏi · đang chạy phương án nào · phương án khác · khuyến nghị) + thay đổi phá hợp đồng FE (checklist K1 khi cấp `k1Checklist` GRANT; route đã xóa: POST /budget-commitments/{id}/invoices, dòng/import/ceilings/publish ngân sách; COST_STATEMENT 422; tiền `{amount,currency}`) + lưu ý demo. Các điểm Chờ Owner đã biết: D-48/FY1-06, D-49, IN-1-O3, B1A-09, FX-1-RG(2), IA-1-Q1…Q5, IA-2-Q1/Q2, B2B-05, B2C-O1, B2C-O3, B2D-Q1, B2B-Q1, PI-1c-Q1, RC-1-Q1/Q2, B3B-05 (QĐ-104k: cờ từ 17/11, SPEC 18/11), B3A-03, B3A-09, B3C-06 (Finance-only ghi phần đã chi), FIX-B3b-Q1/Q2, FIX-SM1-Q1 (B đang chạy, A'), RV-1-Q1/Q2 (A), AD-1-Q1, FIX-AD1-Q1/Q2, RV-3-O3/FIX-RV23-Q1 (A), FIX-RV23-Q2, LBG-08, LBG-12, LBG-13, MG-03 (Owner đã chốt A).
4. **AUDIT.md** của fe-feedback (các đợt review, finding đã sửa, kết quả CI).
5. **Tài liệu API FE** sinh lại ở `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` (generator `tools/build-api-docs.mjs`, `API_DOCS_BE=<clone sạch của feat/fe-feedback>`), commit Docs `main`, không push.
6. **Soạn prompt 4** cho Owner duyệt: audit toàn bộ code 3 SPEC (bug-fix, MF-2/MF-3, FE feedback) theo 5 MF + Z2 seed (ngân sách mới BG/BM-10, chính sách, hóa đơn mua, seat-tháng `chargeMonth` các tháng đã qua, logo; sửa seed/flows đỏ) + gọi API thật DEMO + full CI + `HANDOFF-REVIEW.md`.
7. Cập nhật memory + HANDOFF-CHAT bản 4 trong BE. Không push/merge/deploy trừ khi Owner bảo; BE được commit khi Owner ngủ.

## 3. Cách làm đã chốt với Owner (15–16/11)
- Review sau mỗi đợt/gói: 1–3 agent Opus chỉ đọc + tự đọc migration/SQL/phân quyền + test thật trên bản sạch DB riêng (file chạm + integration module + `test:http` toàn bộ) + mutation ⟹ FIX gửi chat 81 (subagent Sonnet) ⟹ verify FIX. Lỗi logic sửa ngay; nợ test thuần ⟹ FIX-TEST cuối.
- Model: code = Sonnet; Opus chỉ điều phối/review.
- Ping chat 81 mỗi 90 phút (Bash nền `sleep 5400`) + `notify_when_idle`.
- Chat code chỉ nhận quyền mở rộng khi Owner nói trực tiếp trong chat đó (đã có lệnh Owner trong chat 82; chat 81 vẫn nhận lệnh chat điều phối).
