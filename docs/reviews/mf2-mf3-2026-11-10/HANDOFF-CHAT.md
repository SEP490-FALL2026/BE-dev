# Bàn giao chat — đợt MF-2/MF-3, dọn tài liệu, kho dùng chung (10–12/11/2026)

> Đọc file này **trước tiên** ở chat mới. Mọi đường dẫn tương đối tính từ thư mục này
> (`D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\mf2-mf3-2026-11-10\`).

## 1. Cách làm việc Owner yêu cầu (bắt buộc)

- Trả lời **tiếng Việt**, dễ hiểu, có ví dụ; giữ tên file/hàm/API tiếng Anh. Owner hay nói "đọc file không hiểu" ⟹ giải thích bằng ví dụ cụ thể
  (chị Lan nghỉ việc, anh Minh chuyển phòng), bảng tình huống, rồi mới hỏi.
- Mỗi lượt bắt đầu bằng **Skill Preflight** (đọc `SKILL.md` của process + domain + verification skill) và liệt kê skill đã dùng
  (`D:\FPT\FALL2026\CLAUDE.md`).
- Quyết định nghiệp vụ chưa có nguồn ⟹ hỏi bằng câu hỏi có phương án + khuyến nghị (AskUserQuestion), không tự chọn.
- **KHÔNG đồng bộ Docs** (BRD, US, sơ đồ, sổ QĐ) cho tới khi Owner nói rõ **"đồng bộ"**. Khi đồng bộ: Docs commit thẳng `main`, không push.
- BE: không tự commit/push/merge/deploy; Owner tự commit trừ khi cho phép. Không chạy full test local (CI GitHub lo); chỉ quick check
  (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`, `openapi:export`) + test file đã chạm. Không chạy test trong lượt audit.
- Spec/plan: viết gọn (một SPEC + một PLAN), dừng ở đó để Owner duyệt; code do chat khác/agent làm, chat này review.
- Owner ghét trường "trang trí"/khó điền: luôn đề xuất mô hình đơn giản hơn trước.
- Research dùng agent chạy nền (chỉ đọc), báo cáo `R*.md` trong thư mục này.

## 2. Trạng thái repo lúc bàn giao

| Repo / nơi                  | Trạng thái                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BE thư mục chính            | Đang checkout **`dev`** = `a2dad526` (= `origin/dev`), có **~206 thay đổi tài liệu chưa commit**: dọn spec cũ (xóa 23 hạng mục + 3 thư mục review), re-pin scope map roadmap, `sources.md`, `.gitignore`, gỡ 3 gitlink `.claude/worktrees`, thư mục này. Nên `git switch feat/mf2-mf3` (cùng commit, mang theo thay đổi) rồi Owner commit. `rules:check` 0 lỗi, `test:gates` 331/331 |
| BE `../be-flows`            | Nhánh `fix/flows-v4` commit `594f462a` (chat Sonnet): `test:flows` 60 pass/0 fail/9 skip trên seed v4, job `flows` trong `nightly.yml`. Đã review: không nới assert. **Chưa push/PR** — Owner tự làm. Đề xuất bỏ 9 `skip` (đang xanh) tới khi đợt MF-2/MF-3 viết lại                                                                                                                 |
| Docs `D:\FPT\FALL2026\Docs` | `main` sạch (HEAD `8480e79` lúc kiểm). Agent đồng bộ QĐ-110 đã bị **dừng** theo lệnh Owner, sửa dở đã khôi phục. Pin nghiệp vụ hiện hành: `5bb2e6a` (BRD 4.11, QĐ-01→QĐ-109)                                                                                                                                                                                                         |
| Ngoài repo                  | `Code/mf1-mf4-handoff/` đã chuyển vào `../mf1-mf4-reaudit-2026-11-09/handoff/`. 14 nhánh local đã merge bị xóa (giữ `dev`, `main`, `master`, 3 nhánh chưa merge)                                                                                                                                                                                                                     |

## 3. Đã làm trong chat này

1. Audit: [A1](A1-DOCS-MF23.md) tài liệu MF-2/MF-3 · [A2](A2-MF145-COMPLETENESS.md) **MF-1/4/5 + kho xong đường chính** (0 lỗi chặn demo) ·
   [A3](A3-MF2-CODE-API.md) code MF-2 (~75 % đúng) · [A4](A4-MF3-CODE-API.md) code MF-3 (sau ngày hiệu lực còn luật cũ).
2. Dọn tài liệu BE: [A5](A5-DOCS-CLEANUP.md), log [C1](C1-CLEANUP-LOG.md), [C2](C2-CLEANUP-LOG.md), [C3](C3-SCOPE-MAP-REPIN.md); roadmap đồng bộ US
   ([A6](A6-ROADMAP-SYNC.md)).
3. Research: [R1](R1-DATA-HANDOVER-RESEARCH.md) bàn giao dữ liệu · [R2](R2-DATA-HANDOVER-IMPACT.md) tác động bỏ bàn giao ·
   [R3](R3-MOVER-RESPONSIBILITY-RESEARCH.md) điều chuyển/trách nhiệm · [R4](R4-JML-PROVISIONING-RESEARCH.md) Joiner–Mover–Leaver, tài khoản dịch
   vụ, admin nhà cung cấp, phần mềm theo phòng · [R5](R5-EXPANSION-IDEAS.md) ý tưởng mở rộng · [R6](R6-POOL-COST-ALLOCATION-RESEARCH.md) chi phí kho
   (FinOps/kế toán cam kết) · [R7](R7-SAAS-PLATFORMS-COST-ALLOCATION.md) Zylo/Zluri/Torii/ServiceNow.
4. Prompt sửa flows: [PROMPT-FLOWS-V4.md](PROMPT-FLOWS-V4.md) (đã chạy xong ở `../be-flows`).
5. **Toàn bộ quyết định Owner 10–12/11** gom ở [QD-110-DRAFT.md](QD-110-DRAFT.md) — `QĐ-110a…v` + mục G, G2, H. **Đây là nguồn luật duy nhất**
   cho đợt tới (chưa ghi vào Docs).
6. [SPEC.md](SPEC.md) + [PLAN.md](PLAN.md) **v2** (11/11): 16 gói ~126 giờ, hai làn. **Chưa cập nhật** các bổ sung sau khi viết v2 (xem §5 bước 2).

## 4. Tóm tắt luật đã chốt (chi tiết ở QD-110-DRAFT)

- **MF-2 nghỉ việc:** ghi 3–4 trường (ngày cuối, chặn ngay, căn cứ 1 ô chữ, kế nhiệm **bắt buộc** nếu là trưởng phòng); chặn ngay ⟹ ngày cuối =
  hôm nay; hết ngày cuối tự chặn + **tự hủy Request mở**; IT bấm mở thu hồi, hạn ≤ 1 ngày làm việc, quá hạn nhắc mỗi ngày; hệ thống tự đóng hồ
  sơ (tác vụ thất bại ⟹ chưa đóng); chỉ khóa tài khoản + thu hồi, **giữ hồ sơ**.
- **Bỏ hẳn:** bàn giao dữ liệu (mọi ca thu hồi, cả trả seat); **tài khoản dịch vụ** (bot chiếm seat trả phí ⟹ seat thường của một IT Admin +
  cờ _dùng cho tài khoản máy_); theo dõi owner workspace trên hồ sơ; Request một bước khi phòng không có trưởng phòng.
- **Phòng không có trưởng phòng:** mọi Request (đang chờ và mới) **chờ** tới khi có trưởng phòng; Request của chính trưởng phòng vẫn một bước.
  Đổi MF-1 đã deploy (gói MF1-X).
- **MF-3 điều chuyển:** đổi phòng ở ngày hiệu lực, hệ thống tự hủy Request trả phí phòng cũ; **ân hạn 5 ngày làm việc** rồi hệ thống tự tạo thu
  hồi **mọi** quyền cũ; người chuyển tự xin lại qua MF-1 (trong ân hạn xin được phần mềm đang giữ); không giữ seat, không trần +10.
- **Danh sách phần mềm của phòng:** IT phụ trách phòng CRUD, chỉ để hướng dẫn (không tự cấp); nhân viên/trưởng phòng đề xuất thêm, IT xét.
- **IT Admin:** tối đa 4 phòng/người (seed v4 `NV-ITA2` đang 5 phòng ⟹ sửa fixture); chuyển mọi thuê bao của IT rời đi bằng 1 thao tác (không
  chặn đóng); **thuê bao ghi thêm**: tài khoản công ty đứng tên thuê bao, **≥ 2 IT Admin giữ quyền admin nhà cung cấp** (bắt buộc với `K2`
  workspace và `K4` có trang quản trị, không áp `K1`/`K5`), ghi chú tự do; IT phòng mua thêm seat khi kho hết ⟹ báo IT phụ trách thuê bao.
- **Kho dùng chung — chi phí (chốt phương án A, đã xong phần bàn luận):** giữ luật hiện hành — thu hồi thì giải phóng cam kết còn lại (đúng
  thông lệ kế toán cam kết, giống Zylo/Zluri/ServiceNow: chi phí theo người dùng cộng lên phòng, seat trống ở cấp công ty); kho **không** có
  ngân sách riêng — "Dự phòng kho dùng chung" là số kiểm soát trong trần năm, không phải quỹ, tách khỏi ngân sách phòng IT. Thêm ở **đợt luồng
  phụ**: báo cáo đối soát tháng (phòng + _Chưa phân bổ — kho_ = hóa đơn), dòng kho chia theo thuê bao có IT phụ trách, Người duyệt chi thấy
  Dự phòng kho ở B5, chỉ số chi phí seat trống / tỷ lệ dùng / chi phí tránh được.
- **Kèm đợt MF-2/MF-3 (màn đọc):** bảng tiến độ nghỉ việc/điều chuyển + lịch 10 ngày làm việc, báo cáo SLA thu hồi, xem trước khi ghi.
- **Đợt luồng phụ (ngay sau MF-2/MF-3):** `SBF-19`, `SBF-20` (thuê bao kho chưa vào được gia hạn — lỗi N-1 của flows), seat-tháng, nhắc việc,
  K4 thiết bị, `US-07-14`, `US-04-13`, báo cáo ngân sách so với thực chi + tiết kiệm; nhân sự có thời hạn tự vào nghỉ việc, điều chuyển hàng
  loạt, quay lại làm, thu hồi sớm trong ân hạn. `DEFERRED`: khép kỳ chi phí, digest.
- **Hạn cứng:** gói `X-FX` (job 01/01 thiếu tỷ giá ⟹ dùng tỷ giá gần nhất trước 01/01) phải vào `dev` **trước 15/12/2026** (PLAN §4).

## 5. Việc tiếp theo (theo thứ tự)

1. **Hỏi Owner còn điểm nào về MF-2/MF-3/kho**; khi Owner nói "đồng bộ": ghi `QĐ-110a…v` vào `Docs/Decisions/project-decisions.md`, đồng bộ
   BRD (4.11 → 4.12), Định nghĩa phạm vi, Quy trình theo main flow, User Stories (`US-03-09`, `US-07-09`, `US-03-08` ⟹ `RETIRED`; Story mới danh
   sách phần mềm phòng / đề xuất / admin nhà cung cấp / giới hạn 4 phòng), sơ đồ MF-2/MF-3 L0+L1, SBF-16/18/03a/03/17 (flowkit), MF-1/MF-5 phần chạm tới, Use Case + FDD, `Docs/rules/domain-guardrails.md` (Owner duyệt 11/11), roadmap BE theo US, chạy skill
   `docs-sync-check`; ERD/State Machine để sau (QĐ-107a). Có thể giao agent (brief mẫu: xem lần chạy bị dừng — nguồn duy nhất là
   QD-110-DRAFT, không commit, ghi log `Z-DOCS-QD110-LOG.md`), rồi tự đọc lại và commit Docs `main`.
2. **[XONG 11/11 → SPEC/PLAN v2.1, QD-110-DRAFT sửa 110a/110n/110k + mục F2]** Cập nhật SPEC/PLAN v2 với bổ sung sau v2: kế nhiệm bắt buộc (bỏ _chưa có_ ⟹ MF1-X/MF2/MF3 sửa theo), `QĐ-110u` (trường thuê bao: tài
   khoản đứng tên, admin nhà cung cấp theo kiểu cấp, ghi chú), `QĐ-110v` (thông báo mua thêm), 3 màn đọc R5 (gói mới ~15 giờ), seed sửa
   IT Admin ≤ 4 phòng. Trả lời còn mở trong SPEC §9: Q2 tài khoản dịch vụ cũ có người chịu trách nhiệm không phải IT Admin; Q3 lịch FE gỡ màn
   cũ (tab Bàn giao, tài khoản dịch vụ, rà soát điều chuyển).
3. Owner commit thay đổi tài liệu BE trên `feat/mf2-mf3`; push/PR `fix/flows-v4`.
4. Giao code theo PLAN (chat code/agent, hai làn), chat này review từng gói (REVIEW-*.md), cuối cùng tài liệu API FE + seed + flows.
5. **Luồng việc mới (Owner nói sẽ làm ở chat mới):** spec/plan sửa **bug và quyết định nghiệp vụ FE gửi về**. Cách làm đề xuất: gom danh sách
   FE gửi → phân loại (bug BE / thiếu API / quyết định nghiệp vụ / việc của FE) → hỏi Owner các quyết định có phương án → một SPEC/PLAN gọn
   riêng (thư mục `docs/reviews/<tên>-<ngày>/`), không trộn vào SPEC MF-2/MF-3 trừ khi chạm cùng luồng.

## 6. Bộ nhớ

Memory dự án: `C:\Users\Asus\.claude\projects\d--FPT-FALL2026\memory\project_mf2_mf3_2026_11_10.md` (nhật ký quyết định đầy đủ theo thời
gian), các feedback `feedback_*.md` (cách làm việc).
