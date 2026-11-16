# Bàn giao chat điều phối (Opus) — bản 3, 14/11/2026 đêm

> Cho chat điều phối mới **"SEP-Start 121: reseach,review,plan - fix main flows 2-3"** (Opus high), nối tiếp "SEP-Start 120" (sắp cạn
> context). Đọc hết file này trước khi làm gì; nguồn thật ở các file được dẫn. Bản 1, 2 còn trong lịch sử Git.

## 1. Luật làm việc của Owner (bắt buộc)

- **Trả lời tiếng Việt**; giữ tiếng Anh cho tên file, đường dẫn, code, lệnh. **Skill Preflight** mỗi lượt (`D:\FPT\FALL2026\CLAUDE.md`):
  một process skill + domain/review skill + verification skill, đọc `SKILL.md`, liệt kê ở đầu báo cáo.
- Quyết định nghiệp vụ chưa có nguồn: hỏi Owner từng điểm (A/B, khuyến nghị đứng đầu) — **trừ khi Owner ngủ**: khi đó tự chốt theo luật đêm
  (§6) và ghi lại.
- **Repo BE:** Owner cho phép chat điều phối **tự commit** khi Owner ngủ (không push); ban ngày đưa Owner lệnh `git add -- <đường dẫn>`.
  **Không push/merge/deploy** trừ khi Owner bảo.
- **Repo Docs:** việc xong thì tự commit `main`, không push. Sửa nghiệp vụ Docs (BRD/QĐ/US) chỉ khi Owner nói "đồng bộ". Owner đã nói **không
  đồng bộ Docs/QĐ cho tính năng logo** (tiết kiệm token).
- **Đợt này không làm** Use Case, FDD, ERD, State Machine, Context.
- **Luật CI (14/11):** "full test" = **đủ mọi job `.github/workflows/ci.yml`** chạy lại **sau commit CUỐI CÙNG** chạm `src/`/`test/`/seed:
  `pnpm check` · `test:http` · `test:integration` (toàn bộ) · `test:integration:serial` (chỉ lệnh này export `TEST_DATABASE_BOOTSTRAP_URL`) ·
  **`test:e2e`** · `test:integration:timing` · `test:flows` · `seed:local` DB sạch. Suite đỏ do tải ⟹ chạy lại đúng suite `--maxWorkers=2`,
  ghi cả hai. Báo bảng job → lệnh → kết quả → commit; job chưa chạy phải nói rõ. (Đêm 13–14/11 tôi bỏ sót `test:e2e` và không chạy lại sau
  commit seed ⟹ CI đỏ, Owner phải sửa.)
- **Owner chỉ đọc `OVERNIGHT-DECISIONS.md` của từng SPEC** (mf2-mf3, fe-feedback). Các file khác trong `docs/reviews/…` (AUDIT*, HANDOFF*,
  SPEC/PLAN, R*) là tài liệu làm việc của chat Opus/Sonnet — Owner không đọc. Vì vậy mọi thứ Owner cần quyết hoặc cần biết (điểm chờ chốt,
  điểm audit đã sửa, lưu ý demo, lỗ hổng sản phẩm) phải được chép/tóm vào đầu `OVERNIGHT-DECISIONS.md` của SPEC đó.
- **Ghi chép một chỗ:** mọi điểm Sonnet tự chốt (D-n), câu hỏi tự trả lời, finding Optional/Nit để lại, "chưa làm" ⟹ **một file**
  `OVERNIGHT-DECISIONS.md` của SPEC đó (section "Bảng review cho Owner" + "Optional và việc để lại"), để Owner review và FE tra lỗi.
- **Review từng đợt** (Owner 14/11): sau mỗi nhóm gói ⟹ review/verify kỹ (5 trục: nghiệp vụ/luồng/BR theo QĐ mới nhất, đúng đắn, kiến trúc,
  phân quyền/SoD, migration) + rà mọi D-n ⟹ gửi chat Sonnet danh sách FIX (Sonnet sửa, chen trước gói kế) ⟹ đọc lại commit FIX + test sơ
  module chạm ⟹ đợt sau. Full CI một lần cuối SPEC.
- **Ping chat Sonnet mỗi 90 phút** (Sonnet hay tự dừng): hẹn giờ nền 90 phút + `SendMessage(notify_when_idle)`; mỗi lần thức: xem commit mới,
  chat Sonnet đứng mà chưa xong ⟹ nhắn "tiếp tục …", đặt lại hẹn giờ.
- Không lộ email/thông tin cá nhân Owner ra dịch vụ ngoài.

## 2. Đường dẫn và trạng thái nhánh

| Thứ | Nơi / trạng thái |
| --- | --- |
| BE cây chính | `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `feat/mf2-mf3` = `origin` @ `736d0ae8` (Owner đã push; CI đỏ đã sửa bởi chat Sonnet 80: seed spec R28, e2e block pass, test chập chờn). `docs/README.md`, `docs/workspace/README.md` có thay đổi lạ (đề xuất AI MongoDB) — không phải của mình, để nguyên |
| BE worktree prompt 3 | `D:\FPT\FALL2026\Code\be-fe-feedback`, nhánh `feat/fe-feedback` (tách từ `dc879586`), chat Sonnet **"SEP-Start 81: coder mainflow"** (Sonnet xhigh) đang code. Không sửa song song trong worktree này |
| Worktree rác | `D:\FPT\FALL2026\Code\be-audit-base` (xóa không được do khóa file): xóa thư mục rồi `git worktree prune` khi rảnh |
| Docs | `D:\FPT\FALL2026\Docs`, `main @ 4fbaf06` (tài liệu API FE theo BE `67a1abeb` + demo theo seed mới), **chưa push** |
| Tài liệu API FE | `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` (generator `tools/build-api-docs.mjs`, `API_DOCS_BE=<clone sạch>`, `--check`, `--compare coverage-manifest.json`, test `node --test tools/test/*.test.mjs` 45/45) |
| Công cụ audit | `D:\FPT\FALL2026\Code\audit-tools\`: `fulltest.sh <repo> <log-dir>` (đủ job CI + e2e, ghi `summary.txt`), `mutate.py <file> <old> <new> <cmd…>` (KILLED/SURVIVED, tự khôi phục), `review-brief.md` (mẫu brief agent review, thay `{FROM} {TO} {PACKAGES} {AREA} {OUTFILE}`) |
| DB test | container `slm-test-db` `127.0.0.1:35432` (`TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35432/postgres`); cổng 55432 bị Windows chặn; `seed:local`: tạo DB `slm_smoke`, tạm đổi cổng trong `.env.seed.local` (sao lưu/khôi phục). Dùng chung với chat 81 ⟹ `--maxWorkers ≤ 2` khi nó đang chạy |
| Memory | `C:\Users\Asus\.claude\projects\d--FPT-FALL2026\memory\project_fe_feedback_2026_11_11.md`, `feedback_full_ci_before_done.md` |

Thư mục kế hoạch BE `docs/reviews/…`: `mf2-mf3-2026-11-10/` (SPEC v2.3, PLAN v2.4, **AUDIT.md** + AUDIT-A/B/C, AUDIT-DN-1/2,
**OVERNIGHT-DECISIONS.md** có "Bảng review cho Owner"), `fe-feedback-2026-11-11/` (SPEC/PLAN v2.1, OWNER-REVIEW, QD-111-DRAFT,
POLICY-SEED-DRAFT, **PROMPT-3-NIGHT.md**, SONNET-PROMPTS, file này), `be-bugfix-2026-11-12/`.

## 3. Đã xong (13–14/11)

1. **Prompt 2 (MF-2/MF-3) + audit đêm 13–14/11** — biên bản `mf2-mf3-2026-11-10/AUDIT.md`: sửa D-2, D-5, D-62/D-64, A-1, B-4, C-1, B-2
   (migration `20261113002700`), gate/serial/flow; full test; **seed Z** `b4e638cf` (40 người/29 tài khoản; NV-ITA4 IT Admin nghỉ có bàn
   giao, NV-DEV4 điều chuyển, danh sách phần mềm phòng + đề xuất, K4 có trang quản trị, R28 K5 không trưởng phòng, NV-OFF1 luồng mới).
   Docs `4fbaf06`. Owner đã push; CI đỏ (e2e + seed spec do tôi sót) đã sửa.
2. **Bảng review D-n MF-2/MF-3**: một agent đang/đã gom vào đầu `mf2-mf3-2026-11-10/OVERNIGHT-DECISIONS.md` (commit "bảng review D-n cho Owner
   và gom Optional") — kiểm commit đó có trên `feat/mf2-mf3`; nếu chưa, gom lại.
3. **Logo ứng dụng** (Owner duyệt phương án A, không Docs/QĐ): `applications.logo_url` HTTPS ≤ 500, đọc ở mọi màn — chat 81 đã làm
   CT-1.L1–L3 trên `feat/fe-feedback`; **Z2 gắn logo cho app demo**.

## 4. Đang chạy — prompt 3 (SPEC feedback FE v2.1) trên `feat/fe-feedback`

- Prompt ở [PROMPT-3-NIGHT.md](PROMPT-3-NIGHT.md) (+ bổ sung qua tin nhắn: CT-1.L logo; luật gom Optional một file). Thêm gói `AUDIT-MF23`
  sau IN-1 (D-78, D-122a, phạm vi IT Admin ở IN-1).
- **Đợt review** (PLAN §2): **B1** FX-1, FX-2, RQ-1, RQ-2, RQ-3, XY-1, CT-1 (`dc879586..a4e31ff5`) — **đã review**, 3 file chưa track trong
  worktree: `fe-feedback-2026-11-11/AUDIT-P3-B1-A.md` (tiền/VND/01-01), `-B.md` (Request), `-C.md` (danh mục/logo). Đã gửi chat 81 gói
  **FIX-B1** (14/11 ~23:30): FIX-B1.0 merge `feat/mf2-mf3` vào `feat/fe-feedback`; B-C1 Critical (trả cam kết đọc `expected_end_date`
  NULL ⟹ tính như dùng lâu dài); B-R1 (hợp đồng hết trước kỳ ⟹ 422 `TERM_CONTRACT_ENDED`); B-R2 (case B đánh giá K1/K4 kiểm lại số tháng);
  B1A-01 (Request cũ ngoại tệ đọc như VND); B1A-02 (seed còn route tỷ giá đã xóa, Cursor USD, `expectedEndDate`); B1A-03 (nguồn giá chỉ
  VND, PATCH không hạ ACTIVE→DRAFT ngầm); B1A-04 (D-29 trái `QĐ-111ak`); C-R1 (chặn đổi gói có thuê bao TERM sang K4); C-R2 (sổ D-36,
  D-32/33); C-R3 (module card). Optional/Nit ⟹ chép vào OVERNIGHT §Optional.
- **Việc kế tiếp của chat mới:**
  1. Nhắn chat 81 (một dòng) rằng từ giờ báo cáo/"PROMPT 3 XONG" gửi về **"SEP-Start 121: …"**; đăng ký `notify_when_idle`; đặt hẹn giờ
     90 phút (lệnh nền `sleep 5400` rồi xem `git log -1`, file `PROMPT3-DONE.md`).
  2. Khi chat 81 xong FIX-B1: đọc từng commit FIX so với finding (đúng hướng sửa? test đỏ trước? mutation chỗ chính), chạy unit + integration
     các file chạm `--maxWorkers=2`; sai ⟹ gửi lại.
  3. **B2** IN-1, AUDIT-MF23, IA-1, IA-2, K1-GR, CO-1 (đợi dòng `CO-1-G` trong `HANDOFF-CODE.md`) · **B3** US-1, US-2, PI-1, PI-2, RC-1, RC-2 ·
     **B4** BG-1, BG-2, SM-1, RV-1, AD-1, RV-2, RV-3 · **B5** PL-1, PL-2, PL-3, PF-1. Mỗi đợt: 2–3 agent Opus chỉ đọc theo
     `audit-tools/review-brief.md` (đọc qua `git diff/show`, file `AUDIT-P3-Bn-x.md`), tự đọc migration/phân quyền, gửi FIX-Bn.
  4. Khi "PROMPT 3 XONG": rà D-n còn lại + file OVERNIGHT, full CI (§1) trên `feat/fe-feedback`, viết `fe-feedback-2026-11-11/AUDIT.md`, sinh
     lại tài liệu API FE (Docs, commit), cập nhật memory.
- **Prompt 4 chạy ở phiên MỚI** (Owner 15/11; prompt 3 dự kiến xong đêm 15–16/11): **4a audit** do một chat Opus mới (bàn giao từ chat 121)
  + agent Opus chỉ đọc theo §7, cả 3 SPEC, full CI ⟹ danh sách FIX; **4b** một chat Sonnet MỚI (context sạch) làm FIX + Z2 + test đỏ + API thật
  + full CI; Opus đọc lại commit FIX. Chat 81 dừng ở prompt 3 (không tự audit code của mình). Chat 121 khi prompt 3 xong: viết bàn giao cho chat
  Opus mới (theo mẫu file này), không tự chạy prompt 4.
- **Prompt 4 = audit TOÀN BỘ code + chức năng đã làm theo cả ba SPEC (bug-fix, MF-2/MF-3, feedback FE): logic, nghiệp vụ, luồng/BR theo QĐ
  mới nhất, kiến trúc** — rồi các việc pha cuối. Soạn khi prompt 3 xong, Owner duyệt: Z2 seed (ngân sách mới, chính sách, hóa đơn, logo; sửa seed đỏ do bỏ tỷ giá),
  sửa test đỏ, gọi API thật theo DEMO-1…15 + kịch bản MF-2/MF-3, full CI một lần, `HANDOFF-REVIEW.md`. Phần MF-2/MF-3 và seed Z đã xong.

## 5. Chờ Owner chốt (sáng)

- MF-2/MF-3: `mf2-mf3-2026-11-10/AUDIT.md` §3.2 — **D-82/88/92** (deploy: migration làm điều chuyển đang dở tự thu hồi quyền cũ ⟹ chạy thử
  trên bản sao DB trước), **D-95** (giữ chặn trùng gói trong ân hạn, sửa chữ `QĐ-110q` — khuyến nghị), C-2/D-105, C-3/D-103, B-3, A-2, B-1, D-88,
  lỗ hổng: IT Admin nghỉ không phụ trách phòng không tự thấy id hồ sơ để gọi P5.
- Prompt 3: các D-n "chờ Owner" trong `fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md` (vd. D-31 nhắc ngân sách năm sau nhiều lần).

## 6. Luật chạy đêm của chat Sonnet (giữ nguyên bản 2)

Một subagent một gói, tuần tự; không AskUserQuestion; tự cân 2–3 phương án theo QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ, không
trái QĐ; ghi D-n (câu hỏi · phương án · chọn + căn cứ · file/commit · cách đổi lại), commit "(tạm chốt D-n)"; mục "Bị chặn", "Dừng ở đâu",
"Tóm tắt cho Owner". Quick check mỗi task; cuối gói `test:gates`, `rules:check`, `openapi:export`, `arch:routes`, `arch:graph`. Cấm full
suite/seed:local (để audit/pha cuối), push/merge/deploy, sửa Docs. Mô tả OpenAPI không chứa mã `QĐ-…`. Chat Sonnet đầy giữa chừng ⟹ chat
Sonnet mới, dán prompt của SPEC + "đọc HANDOFF-CODE.md và OVERNIGHT-DECISIONS.md, làm tiếp từ gói/task chưa có commit".

## 7. Tiêu chuẩn review / verify / check code (Owner nhấn mạnh — áp cho MỌI đợt và audit cuối)

Mục tiêu: xác nhận code Sonnet viết **đúng kiến trúc, logic, nghiệp vụ, luồng, BR theo tài liệu, main flow và quyết định mới nhất**, tìm bug
thật — không chỉ "test xanh". Code AI viết phải soi kỹ hơn code người viết.

1. **Nguồn đúng, mới nhất** (thứ tự căn cứ): sổ QĐ `Docs\Decisions\project-decisions.md` (QĐ mới nhất thắng; đọc cả QĐ sửa đổi) → BRD →
   `Quy trình và chính sách theo main flow.md` → sơ đồ MF L0 `Docs\Diagrams\main-workflows-activity-diagram\` (luật `BR-MFn-xx`) → US/AC
   (`Docs\BE-UserStory`) → OWNER-REVIEW / QD-11x-DRAFT / DECISIONS → SPEC/PLAN → code. SPEC ghim mốc Docs cũ ⟹ đối chiếu thêm Docs `main`
   hiện tại, ghi chỗ lệch.
2. **Nghiệp vụ + luồng:** đi từng bước main flow và luồng phụ được gọi — ai làm, điều kiện, trạng thái trước/sau, thông báo ai, audit gì,
   tiền/cam kết ra sao; mỗi BR có code + test. Ca biên: phòng không trưởng phòng, người chưa xếp phòng, nghỉ/điều chuyển giữa chừng, Request
   nhóm, K1/K2/K4/K5, quyền có thời hạn vs dùng lâu dài, qua năm 01/01.
3. **Logic đúng đắn:** transaction và thứ tự khóa (deadlock), race giữa job quét và thao tác tay, idempotent khi chạy lại/đa instance, ngày
   làm việc + múi giờ tổ chức (`business-date`), tiền VND (đơn vị minor, làm tròn, năm nay/năm sau, trả lại một lần), phân trang, N+1.
4. **Kiến trúc** (`AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/*`): tầng ADR-0019, chỉ import module khác qua `public/` (facade/types/errors),
   **không query bảng module khác** (kể cả quan hệ Prisma lồng), capability folder + file vào group, hậu tố đúng vai, ≤ 25 file/thư mục,
   module card README cập nhật, không thêm Hook/Listener sai chiều; `arch:check`, `test:gates`.
5. **Phân quyền / SoD:** ai gọi được route (decorator), phạm vi phòng của IT Admin/trưởng phòng, SoD-1…8 (không tự duyệt, Super Admin không
   thao tác chính mình…), không lộ dữ liệu wire (email, tiền với vai không được xem); mô tả OpenAPI không chứa mã `QĐ-…`.
6. **Migration:** số tăng dần, `_values` riêng cho enum, expand–contract, không drop/đổi kiểu phá dữ liệu, backfill đúng và có audit, chạy
   lại an toàn, trigger/CHECK khớp code; nghĩ tới dữ liệu thật đã có (deploy).
7. **Test:** đọc test bị sửa/xóa (nới assertion, `it.skip`, xóa ca âm ⟹ finding); policy có test đỏ trước; mỗi chỗ sửa có **mutation**
   (`audit-tools/mutate.py`) bị bắt; đoán test nào CI sẽ đỏ (Sonnet không chạy full).
8. **D-n và Optional:** rà **từng** D-n Sonnet tự chốt theo (1): trái QĐ/BRD ⟹ Required phải sửa; thiết kế ⟹ ghi A/B. Kiểm code làm đúng
   như D-n ghi. Mọi thứ Owner cần ⟹ đầu `OVERNIGHT-DECISIONS.md` của SPEC.
9. **Cách làm:** 2–3 agent Opus chỉ đọc theo `audit-tools/review-brief.md` (đã chứa 5 trục trên) chia vùng; **tự đọc** migration, SQL, phân
   quyền, test bị sửa; Critical/Required phải có file:dòng + kịch bản; gửi FIX; **đọc lại commit FIX** (đúng hướng, có test đỏ trước, mutation)
   rồi test các file chạm; cuối SPEC full CI §1.
