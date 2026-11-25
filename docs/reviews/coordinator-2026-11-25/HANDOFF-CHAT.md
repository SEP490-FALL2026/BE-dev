# HANDOFF — chat điều phối 24–25/11/2026 → chat điều phối mới

> Đọc file này trước, rồi: memory `MEMORY.md` (đặc biệt `project_redesign_2026_11_21`, `project_two_person_process`,
> `project_wave8_test_cleanup`, mọi `feedback_*` — nhất là `feedback_be_skill_set_per_step` (MỚI), `feedback_model_roles`,
> `feedback_verify_before_approval`, `feedback_code_prompt_guard_rules`, `feedback_logic_now_tests_later`); bảng skill theo bước ở
> Docs `rules/skill-workflow.md`; quy trình hai làn `docs/guides/quy-trinh-code-ai.md`; quyết định Owner
> `D:/FPT/FALL2026/Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (mục cuối "Cuối đợt 2", W3-*, OQ-D1); sổ QĐ tới **`QĐ-119e`**.
> Handoff trước: `docs/reviews/coordinator-2026-11-24/HANDOFF-CHAT.md`.

## 0. Bối cảnh

- Chỉ làm đồ án **SEP**: BE `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (origin `SEP490-FALL2026/BE-dev`), Docs
  `D:\FPT\FALL2026\Docs`, tool `D:\FPT\FALL2026\Code\Tool-SEP`. FE web + Mobile không phải việc của mình — sau mỗi đợt giao API
  description (`Docs/Figma UI-UX/API-Integration/`).
- Thư mục BE chính là chỗ **Neon** (Antigravity/Gemini, làn `biz` của Owner) code, hiện ở `int/redesign-w3` — **không checkout
  nhánh khác ở đó**, giữ nguyên `FLOWS-V4-REPORT.md` (đang xóa chưa commit, Owner dặn để nguyên). Việc riêng dùng `git worktree`
  (đang có: `Code/BE-w4-spec` — nhánh hiện tại là nhánh handoff này; gỡ khi PR handoff merge).
- **Bảo** (`HoaiBao200104`) làn `tech`, nhánh `feat/redesign-w3-tech` (tách từ `origin/int/redesign-w3`).

## 1. Trạng thái (25/11 tối)

| Việc                        | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE `origin/dev`             | `ae3b1400` = đợt 1 (`4e029dbd`) + **đợt 2** (`70543271`, PR #86) + spec đợt 4 bản 2.2 (PR #89)                                                                                                                                                                                                                                                                                                    |
| **Đợt 2**                   | **XONG.** Audit A/B/C + R1–R4 + audit "không code giả/test giả" (Opus) sạch. CI cuối `45472955163`: 0 spec mới đỏ; 113 spec cũ đỏ, đủ tên + nguyên nhân trong `docs/reviews/redesign-w2-2026-11-22/FIX-TEST-W2-ALL.md` (đợt 8). Quyết định Owner: `FIX-PLAN-W2.md` mục 1, 6                                                                                                                       |
| **Đợt 3** `int/redesign-w3` | Spec **bản 2.4** (`DELTA-W2-FINAL.md`, hai làn song song, OQ-D1 = cho người được chỉ định làm). Neon xong **B1** (P1→P3→P2→P4→P8, `444e6fc3`, CI `45570280587`: quality xanh, 13/13 spec mới B1 xanh — **chưa review**). **Bảo chưa push** `feat/redesign-w3-tech` ⟹ Neon dừng ở cửa C1 (P10 cần P9a/P9b). Owner: "đợi Bảo báo cáo rồi làm tiếp", không cập nhật PLAN thêm                        |
| Việc Bảo đợt 3              | Đã gửi bảng 12 gói (PLAN 2.4): làm ngay P9a → P11 → P12a → P20b → P12b → P21 → P14 (trừ cổng ≥2 admin) → P22a; chờ Neon: P9b (sau P1 — đã có), cổng P14 (sau P10), P15 (sau P16a), P22b (sau P20); P23 cuối. Lúc chờ: chạy/sửa integration bằng Docker trên `fix/redesign-w3-b<n>-tests`                                                                                                          |
| Khi Bảo push                | Điều phối gộp `feat/redesign-w3-tech` vào `int/redesign-w3` (bộ kiểm nhanh) ⟹ báo Neon làm P10 → P16a → P13a → P13b → P16b → P17 → P18 → P19 → P20 → P23; cuối đợt Neon làm nốt 3 phần dính (cổng P14, P15, P22b) nếu Bảo đã xong                                                                                                                                                                 |
| Cuối đợt 3                  | Opus review/audit B1/B2/B3 + audit không code giả/test giả + reviewer độc lập kiểm khuyến nghị ⟹ AskUserQuestion ⟹ sửa ⟹ CI đầy đủ ⟹ PR từ nhánh chụp (`pr/redesign-w3-b<n>`) ⟹ Owner squash. **Trước đó viết `DELTA-W3-FINAL.md`** cho đợt 4                                                                                                                                                     |
| **Đợt 4** (phiếu nhiều mục) | Spec **bản 2.2** đã ở `dev` (`docs/reviews/redesign-w4-2026-11-25/`): 2 review Opus (biz + tech) đã áp, Owner chốt OQ-W4-1..4 = A + duyệt `NESTED_ARRAYS`, PLAN theo `superpowers:writing-plans`. Chỉ code sau khi đợt 3 vào `dev` + `DELTA-W3-FINAL`                                                                                                                                             |
| API description             | Đợt 1+2 **xong** (Docs `3255dd4`, `7dd46f2`): `changes/2026-11-25-redesign-w1-w2.md`, 2 luồng mới, 9 mã thông báo, sửa 6 luồng cũ; generator 453/453. Ghi chú: `UNPLACED_WORK_WAITING` còn nhắc lại mỗi ngày khi IT được chỉ định không dùng được (code lệch SPEC nhỏ ⟹ nợ đợt 8)                                                                                                                 |
| Docs                        | Đã push (Owner). Dọn: xóa `Diagrams/State-diagram/` (vẽ lại theo mẫu trường sau đợt 6); `Research-AI/` sắp lại `vendors/ usage-tracking/ policies/ tax/ archive/ redesign-2026-11-21/` (giữ nguyên `DECISIONS.md` + tên thư mục redesign tới hết redesign); `research_notes` đã nhập vào Docs và xóa. Link hỏng toàn Docs 275 → 217 (nợ cũ). ERD checker 24 lỗi có từ trước                       |
| Kiểm kê luồng phụ           | `Docs/Research-AI/redesign-2026-11-21/SBF-CODE-INVENTORY-2026-11-25.md`: 22 SBF — 11 đủ, 8 thiếu một phần, 1 chưa có (`SBF-10`), 2 thuộc đợt 3–6; 11 việc cho đợt 7                                                                                                                                                                                                                               |
| Audit User Stories          | `Docs/Reviews/us-audit-2026-11-25/REPORT.md` (**chỉ ở máy local** — `Reviews/` bị `.gitignore`): 150 phát hiện (16 sai luật, 49 lỗi thời, 40 thiếu, 15 AC yếu, 30 khác), 11 câu cần Owner (chưa hỏi, cần reviewer độc lập trước). EP-04/EP-15 để sau spec đợt 4–5. Bước 1: xóa `tools/__pycache__`, `handoffs/organization-workforce-authority-2026-10-24.md` (bỏ 6 link + `build_us.py --write`) |
| Deploy                      | Owner đồng ý: không sửa `ci.yml`; merge `dev → main`, chạy CI tay để `quality` xanh, rồi **Actions → Backend CD (Deploy to VPS)** `mode = deploy` trên `main` (có backup/preflight/rollback). Đợt 3 deploy sau khi squash                                                                                                                                                                         |

## 2. Việc tiếp theo (theo thứ tự)

1. **Chờ Bảo push** ⟹ gộp vào `int/redesign-w3` ⟹ báo Neon tiếp P10. Trong lúc chờ có thể review B1 (Opus) và cắt `pr/redesign-w3-b1`.
2. **Đang chờ Owner trả lời:** (a) ghi **QĐ-120** từ `DECISIONS.md` (W2E-_, W3-_, OQ-D1, OQ-W4, TOOL-W8) + sửa các QĐ cũ mâu thuẫn mà audit US nêu (`QĐ-62b`↔`114aa`, `66w`↔`117g`, `111aj`↔`115m`, `103y(4)`↔`116aq`, `118c` "ba kết cục" ↔ bốn); (b) **sửa skill `docs-sync-check`** — bước kiểm link gọi `check_links.py` không tham số nên kiểm 0 link. Sau đó: đồng bộ BRD/Scope theo QĐ-120 **kèm dọn lịch sử** (giữ mã QĐ trích dẫn trong câu); rồi sửa 150 phát hiện US + hỏi 11 câu (reviewer độc lập trước).
3. Cuối đợt 3 như bảng §1 ⟹ `DELTA-W3-FINAL.md` ⟹ đợt 4 code (prompt Neon/Bảo theo `CODE-PROMPT.md` đợt 4) ⟹ API description đợt 3.
4. Đợt 5 (AI — giữ theo CUT-5, ghi QĐ khi viết spec), đợt 6 (CUT-6 giữ: tách 6 operation + `expectedUpdatedAt`, `GET /audit-actions`, lý do đổi tham số, tải chính sách, `KPI-2`), **đợt 8** (FIX-TEST 113 + đợt 3–5; rà toàn bộ test, xóa test/flows cũ — đưa danh sách Owner duyệt; seed + demo D-1..D-4 + seed luật làm thay R2-4; nợ NF-1..5, R3-5, R3-7, R3-8, R4-5..10, RC-11; Tool: nghiên cứu lại, nối server, Task Scheduler, cờ khớp tài khoản, câu gửi nội dung prompt). **Đợt 7 làm SAU đợt 8** (Owner 25/11): 11 việc theo SBF-INVENTORY + 3 điểm cần Owner (job đối soát connector — khuyến nghị không code; FR-5.14 tóm tắt tháng — O1 đề xuất bỏ; `SBF-07a` QĐ-104j).
5. **Prompt 4+6** sau đợt 8 (Owner 25/11 nhấn mạnh): review sâu toàn bộ hệ thống — từng flow (5 MF + SBF), từng API (debug quyền, mã lỗi, contract, tiền), logic code, kiến trúc; vì nhiều đợt và nhiều agent/skill khác nhau. Làm bằng nhiều Opus chia theo module/luồng + reviewer độc lập + chạy thật (CI đầy đủ, seed + gọi API theo kịch bản demo). Kết quả: danh sách sửa trước demo + API description cuối cho FE.
6. Vẽ lại: State Machine (mẫu trường) và ERD (từ `prisma/models`) **sau đợt 6**. Audit sâu US EP-04/EP-15 sau spec đợt 4–5.

## 3. Quy ước (Owner)

- Tiếng Việt; **Skill Preflight** mỗi prompt. **Bộ skill theo bước (MỚI, `rules/skill-workflow.md`):** spec = `superpowers:brainstorming`
  - `spec-driven-development`; plan = `superpowers:writing-plans` + `planning-and-task-breakdown`; code = `superpowers:executing-plans`
  - `superpowers:test-driven-development` + repo skill `be-quick-check` (`create-migration` cho gói migration); verify =
    `superpowers:verification-before-completion`; review = `code-review-and-quality` + `superpowers:requesting-code-review`. Không tạo
    `docs/superpowers/`; plan nằm ở `docs/reviews/<đợt>/`.
- **Opus** mặc định cho spec/review/audit/docs; **Fable** chỉ luật tiền/ngân sách/quyền cực nặng (nêu lý do, Owner đồng ý trước);
  **Sonnet/Gemini** code. Khuyến nghị chỉ đưa Owner sau reviewer độc lập; hỏi **từng câu** bằng AskUserQuestion, có khuyến nghị; ghi
  `DECISIONS.md` / `OWNER-ANSWERS.md` ngay.
- Mọi prompt code có **LUẬT CỨNG** (`feedback_code_prompt_guard_rules`) + orchestrator tự đọc `git diff` trước khi ghi `xong`;
  fixture integration theo QĐ-118 (`setItAdminInCharge`), K4 có `key_binding`, SQL thô đọc schema thật.
- Cuối **mỗi đợt**: review/audit sâu + audit không code giả/test giả + **CI đầy đủ**; test mới của luật mới phải xanh trong đợt; test
  cũ ⟹ FIX-TEST đợt 8 (ghi đủ tên file). Không squash khi luật mới chưa có test xanh.
- Máy Owner/Neon yếu: không full test trên máy; CI GitHub (`gh workflow run ci.yml --ref <nhánh>`). Bảo có Docker. Push nhánh
  feature/int được; merge `dev`/`main`, deploy chỉ Owner. `dev` chỉ nhận **squash**, PR phải tách từ `dev` (không kéo code nhánh
  khác — bài học PR #89), giữ `Co-authored-by` của Bảo. Commit identity sẵn có, **không** co-author/attribution AI.
- Docs: commit thẳng `main`, không push (Owner tự push). Sổ QĐ **CRLF**; sau sửa BRD/QĐ/US chạy `docs-sync-check` (lưu ý lỗi kiểm
  link ở §2.2b). Handoff điều phối luôn ở BE `docs/reviews/coordinator-<ngày>/HANDOFF-CHAT.md` (nhánh docs từ `origin/dev`, PR).
