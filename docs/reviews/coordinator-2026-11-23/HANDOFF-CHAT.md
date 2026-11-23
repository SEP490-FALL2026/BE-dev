# HANDOFF — chat điều phối 22–23/11/2026 → chat điều phối mới

> Đọc file này trước, rồi: memory `MEMORY.md` (đặc biệt `project_redesign_2026_11_21`, `project_two_person_process`,
> `feedback_model_roles`, `feedback_verify_before_approval` và mọi `feedback_*`); `DECISIONS.md` (lịch sử câu Owner
> trả lời — `D:\FPT\FALL2026\Docs\Research-AI
edesign-2026-11-21\DECISIONS.md`); sổ QĐ `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md` (tới **`QĐ-118o`**). Handoff trước: `docs/reviews/coordinator-2026-11-20/HANDOFF-CHAT.md` và `D:\FPT\FALL2026\Docs\Research-AI
edesign-2026-11-21\HANDOFF-CHAT.md`.
> Quy trình code hai người: BE `docs/guides/quy-trinh-code-ai.md`.

## 0. Bối cảnh

- Chỉ làm đồ án **SEP**: BE `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (origin `SEP490-FALL2026/BE-dev`), Docs
  `D:\FPT\FALL2026\Docs`, tool `D:\FPT\FALL2026\Code\Tool-SEP` (origin `SEP490-FALL2026/Tool-service`). FE web + Mobile không phải
  việc của mình — sau mỗi đợt BE bàn giao **API description** (`Docs/Figma UI-UX/API-Integration/`).
- Đợt thiết kế lại sau phản hồi giảng viên 21/11: QĐ-114 → QĐ-118. Code chia **8 đợt** trước Prompt 4+6 (xem §3).
- Nhóm 2 người: **Owner** làm làn `biz` (nghiệp vụ, dùng orchestrator Neon/Gemini, tự quyết + `OVERNIGHT-DECISIONS-biz.md`),
  **Bảo** (`HoaiBao200104`, email `vuonghoaibao20012004@gmail.com`) làm làn `tech`. Mỗi đợt: nhánh gộp `int/redesign-wN`; Bảo
  nhánh riêng; Owner merge làn tech vào nhánh gộp; **Opus review + audit trên nhánh gộp** ⟹ Sonnet sửa ⟹ CI GitHub lần 2 ⟹ PR
  vào `dev` **squash** (giữ dòng `Co-authored-by`, thêm tay Bảo nếu thiếu) ⟹ API description.

## 1. Trạng thái (23/11 tối)

| Repo                                | Trạng thái                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE `origin/dev`                     | `4e029dbd` = **đợt 1 đã merge** (squash PR #76, có `Co-authored-by: HoaiBao200104`). CI 8/8 xanh trên commit đã merge (run 45117137932)                                                  |
| BE PR **#78** (đã squash vào `dev`) | Spec đợt 2 (đã review 2 lượt, sửa hết) + spec đợt 3 (**nháp, chưa review**). Owner đang giao việc đợt 2                                                                                  |
| BE máy Owner                        | `docker-compose.prod.yml` bị sửa 4 dòng — **không phải của mình**, không commit                                                                                                          |
| Docs `main`                         | `6551725`, **3 commit chưa push** (Owner tự push)                                                                                                                                        |
| Tool-service                        | `main` = `65fb551` (first commit); nhánh **`feat/portable-setup`** `7fd3264` đã xong + Opus review + 1013 test xanh — **Owner cần merge PR vào main** rồi gửi FE `HUONG-DAN-DUNG-THU.md` |

## 2. Đã làm 22–23/11

- **QĐ-117a…p** (điểm mở sau handoff: tiềm năng/thực, K1 năm điều chuyển, M1 quyền theo vai, KPI-5, x/y checklist, cổng admin khởi
  tạo, K4 dư lần đầu, M2 tỷ giá, cổng 1 ghost seat cho K4, tải chính sách chỉ bản xuất bản…) — BRD 4.17.
- **QĐ-118a…o**: cắt phạm vi đợt 5–7 (CUT-5/6/7); **việc của phòng chỉ IT phụ trách phòng làm**, bỏ hàng việc IT chung, Super
  Admin chỉ định IT làm thay tạm (không tính trần 4 phòng), chỉ Super Admin đổi IT phụ trách thuê bao/mục danh mục, áp cho mọi việc
  và thông báo của phòng, giao/thu/kích hoạt máy theo phòng người giữ, việc của người chưa xếp phòng do Super Admin chỉ định theo
  việc, IT tự cấp cho mình giữ `QĐ-77m`. BRD **4.18**, Quy trình 1.14, Phạm vi 2.14, Bộ chính sách 1.2, US **0.20** (199 Story,
  `US-01-16` tải chính sách, `US-01-17` chỉ định làm thay), UC 8.3, FDD/CTX 8.1. `docs-sync-check` xanh (ERD FAIL từ trước —
  Owner loại ERD/SM khỏi đợt này).
- Rà R1/R2 `NOTE MD/mainflows.md`; tồn đọng US (TS cho mọi AC, bỏ `per_seat`, tiêu đề cũ, MF-1 GH-2 = 10/tuần).
- **Đợt 1** (27 mục, hai làn) code xong ⟹ 3 reviewer Opus (`REVIEW-A/B/C`) ⟹ quyết định (`REVIEW-DECISIONS.md`) ⟹ Sonnet sửa
  27 commit ⟹ CI xanh ⟹ merged. Để sau (ghi `REVIEW-FIX-NOTES.md`): phân trang sweep hàng đợi trình (không làm), RB-8 (không
  làm), 2 test bổ sung (đợt seed), tách file thư mục 25 file (khi chạm lại).
- **Spec đợt 2** (`docs/reviews/redesign-w2-2026-11-22/`): SPEC, PLAN, CODE-PROMPT (dòng `LÀN:`), OWNER-ANSWERS (W2-Q1…Q10),
  REVIEW-SPEC (31 finding), REVIEW-SPEC-2 (17 finding) — đã áp hết. 5 migration, ~23 route mới, ~85 đổi (8 phá contract,
  ~41 đổi quyền).
- **Spec đợt 3** (`redesign-w3-2026-11-22/`): SPEC chia B1/B2/B3, 28 mục, 23 gói, 7 migration — **chưa review**; câu hỏi gom:
  W3-Q1 (thuế không khấu trừ khi chia tiền lô K4 — khuyến nghị A chia theo chi phí thực chịu), **quyền theo vai chưa có đường
  ghi trong code** (đợt nào làm/cắt).
- **Tool-service**: một lệnh `setup.cmd`, `run.cmd`, gate theo hình dạng dữ liệu (cùng major, không prerelease), `/usage` bản
  lạ khóa khi không chứng minh được 0 lượt model, quota bản lạ không gửi server; hướng dẫn FE `HUONG-DAN-DUNG-THU.md`.
- **Vendor demo MF-5**: `Code/audit-tools/Tools/workstreams/vendor-sources/demo-mf5-vendor-selection-2026-11-23.md` (Sonnet) +
  mục "Kiểm độc lập (Opus 23/11)": 27/30 sự thật đúng. Khuyến nghị: **Jira Free** nguồn thật (cần sửa `QĐ-21`), **M365** mô
  phỏng tầng B, **Copilot** fixture, Slack ca bị chặn. **10 câu Owner Q1–Q10 chưa hỏi** (mục K.4 của file).

## 3. Việc tiếp theo (theo thứ tự)

1. **Giao việc đợt 2** (Owner đang làm): squash #78 ⟹ tạo `int/redesign-w2` ⟹ Bảo nhánh `feat/redesign-w2-tech`: **T1 trước**
   (schema + 5 migration… lưu ý migration 5 `saas_issue_awaiting_assignee` thuộc gói biz B10c), push + báo ⟹ T2→T5 ⟹ T6/T7 sau
   khi biz xong. Neon làn biz trên `int/redesign-w2`: B0 ngay; **pha B1** (B10a→B10g, B11) khi Owner merge T1; **pha B2** (B1→…→B8,
   B10h, B9) khi merge cả pha 1 (xem CODE-PROMPT §2). Điều phối viên: theo dõi, khi Owner báo xong ⟹ review/audit như đợt 1.
2. **Review spec đợt 3** (Opus; Fable chỉ nếu Owner muốn cho luật tiền) đối chiếu code `dev` sau đợt 1 + spec đợt 2 (lô
   `DEVICE_KEY`, `keyBinding`, `device_activations`, giữ id thuê bao `PERPETUAL`); hỏi W3-Q1 + quyền theo vai; đợt 3 chỉ code sau
   khi đợt 2 merge.
3. **Hỏi Owner 10 câu vendor** (K.4) — ghi QĐ (sửa `QĐ-21`, điều kiện khai `POSITIVE_AND_NEGATIVE`), sửa bộ demo Jira json
   (`Docs/Figma UI-UX/API-Integration/examples/mf5-usage-demo/02-usage-source-jira.json` — cột `Last seen in Jira - <site>`, `LOOSE`).
4. **API description**: Owner chọn viết **sau đợt 2** (gộp đợt 1 + 2). Nếu FE kêu lỗi trước, viết ghi chú thay đổi đợt 1 (PATCH
   thuê bao bắt `expectedUpdatedAt`, `RETRYABLE`/`ALREADY_DECIDED`, route mở lại thu hồi điều chuyển, cờ dashboard).
5. Đợt 4 (phiếu nhiều mục), 5 (AI: thẻ đánh giá, model đọc lý do, đối chiếu chính sách + xác nhận lần hai, F5, **F4 giữ**,
   rate-limit Redis, BullMQ tùy), 6 (tách 6 operation + `GET /audit-actions` + lý do đổi tham số + tải chính sách + `KPI-2`),
   7 (`SBF-10`, `SBF-08` nhập tay, `SBF-07a` giữ, sửa lệch MF-2/MF-3/SBF-03, báo lỗi quyền gắn máy — dời từ đợt 2), **8 seed**
   (lịch sử 12–18 tháng; gom FIX-TEST; rà toàn bộ test CI; chạy seed + gọi API theo D-1…D-4; Owner sẽ **drop DB** khi deploy) ⟹
   Prompt 4+6.
6. Đề xuất đã nói với Owner, chưa làm: job CI chạy tay "seed + flows" (Bảo, cỡ S) để mỗi đợt kiểm seed + API trên DB thật.
7. Owner còn phải: duyệt câu chữ _Bộ chính sách khởi tạo_ (R3, nay bản 1.2) trước seed; push Docs; merge Tool-service.

## 4. Quy ước (Owner)

- Tiếng Việt; **Skill Preflight** mỗi prompt. **Opus mặc định** cho spec/review/audit/docs; **Fable chỉ khi luật tiền/ngân
  sách/quyền cực nặng** (nêu lý do trước); Sonnet/Gemini code. Khuyến nghị chỉ đưa Owner duyệt sau một reviewer độc lập.
- Hỏi Owner từng câu bằng AskUserQuestion (có khuyến nghị, ví dụ số khi cần); ghi `DECISIONS.md` ngay, rồi sổ QĐ.
- Không ghi là GVHD/mentor xác nhận (QĐ-82 → QĐ-118 là của Owner).
- Docs: commit thẳng `main`, không push. Sổ QĐ **CRLF**. Sau mọi sửa BRD/QĐ/US/sơ đồ chạy `docs-sync-check` (`python -B`).
- BE: không chạy full test trên máy (máy yếu) — full test **chỉ CI GitHub** (`gh workflow run ci.yml --ref <nhánh>`, được phép).
  Push nhánh feature được; merge `dev`/`main`, deploy chỉ Owner. Commit identity sẵn có, **không co-author**. `dev` chỉ nhận
  **squash** (ruleset). Mô tả OpenAPI không chứa mã nội bộ.
- Thứ tự khóa chuẩn: **tác vụ → Request** (bảng ở BE `docs/rules/database-business.md`).
