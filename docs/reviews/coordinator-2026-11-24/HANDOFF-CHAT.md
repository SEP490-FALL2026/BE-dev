# HANDOFF — chat điều phối 23–24/11/2026 → chat điều phối mới

> Đọc file này trước, rồi: memory `MEMORY.md` (đặc biệt `project_redesign_2026_11_21`, `project_two_person_process`, mọi
> `feedback_*` — nhất là `feedback_model_roles`, `feedback_verify_before_approval`, `feedback_code_prompt_guard_rules`,
> `feedback_logic_now_tests_later`); quy trình `docs/guides/quy-trinh-code-ai.md`; quyết định Owner
> `D:/FPT/FALL2026/Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (mục cuối: vendor MF-5, review đợt 3, W3-*); sổ QĐ tới
> **`QĐ-119e`**. Handoff trước: `docs/reviews/coordinator-2026-11-23/HANDOFF-CHAT.md`.

## 0. Bối cảnh

- Chỉ làm đồ án **SEP**: BE `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (origin `SEP490-FALL2026/BE-dev`), Docs
  `D:\FPT\FALL2026\Docs`, tool `D:\FPT\FALL2026\Code\Tool-SEP`. FE web + Mobile không phải việc của mình.
- Thư mục BE chính là chỗ **Neon (làn biz của Owner) đang code** trên `int/redesign-w2` — không checkout nhánh khác ở đó; việc
  riêng dùng `git worktree` (đang có: `Code/BE-w3-spec` nhánh `docs/redesign-w3-spec-review`; `Code/BE-handoff` nhánh này — gỡ
  khi PR merge).
- Làn: Owner + **Neon** (Antigravity/Gemini, orchestrator + subagent) làn `biz` thẳng trên `int/redesign-w2`; **Bảo**
  (`HoaiBao200104`) làn `tech` (nhánh hiện dùng: `fix/redesign-w2-tech-t1-review` — nhánh cũ `feat/redesign-w2-tech` push lỗi).

## 1. Trạng thái (24/11 tối)

| Việc                               | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE `origin/dev`                    | `b7a7cc80` = đợt 1 + fix G3 (#82: ô _Last seen_ trống ⟹ G3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Đợt 2** `origin/int/redesign-w2` | `79599fe0`. Có: T1–T5 của Bảo (merge `31500e13`) + `dev` (merge `df7ccb28`) + **toàn bộ làn biz của Neon B0→B9** (B1, B2a…B8, B10a…B10h, B11, B9 xong). Máy Owner có 1 thay đổi chưa commit: `D FLOWS-V4-REPORT.md` (không phải của mình — hỏi Owner)                                                                                                                                                                                                                                                                                                                                               |
| Bảo                                | Đã push `1fe5e345` "review of T2-T5 and CI run 45332982389" lên `fix/redesign-w2-tech-t1-review` — **chưa merge** vào `int`. Merge thử: **xung đột** `docs/generated/module-graph.md` (sinh lại `pnpm arch:graph`) và `src/modules/devices/attributes/device-attributes.controller.ts` (+ `.http-errors.ts` tự gộp). Neon cũng đã sửa F1 (mã lỗi) + F3 (quyền) trong `device-attributes.*` ở B1 `ffe5cde8` ⟹ khi gộp: **giữ mã lỗi SPEC** `DEVICE.SERIAL_TAKEN`/`VOIDED`/`ALREADY_RETIRED` và **giữ kiểm quyền F3 của Neon** (`judgeDeviceActor` + `itAdminsActingFor`, 403 `DEVICE.NOT_IN_CHARGE`) |
| Bảo còn lại                        | **T6 (seed)** + **T7 (chốt làn)** — mở được ngay vì B9 đã xong; T7 gồm D-3: sửa migration 1 `DROP DEFAULT` `device_type`/`asset_code_origin` + bỏ `@default` (làn biz đã ghi đủ hai cột ở B1/B7 — kiểm lại)                                                                                                                                                                                                                                                                                                                                                                                         |
| **Spec đợt 3**                     | **PR #84** (`docs/redesign-w3-spec-review`, bản 2.3 `4a4b81f5`) — 3 Opus review + Opus lượt 2 + **Fable** lượt tiền + rà file giải thích, đã áp hết; `OWNER-ANSWERS.md` đủ. Owner cần **merge squash** PR #84. Đợt 3 chỉ code sau khi đợt 2 squash vào `dev`                                                                                                                                                                                                                                                                                                                                        |
| Docs `main`                        | `f78a922`, **5 commit chưa push** (Owner tự push): QĐ-119a…e vendor demo MF-5 (BRD 4.19, Scope 2.15), báo cáo vendor + hướng dẫn setup + 11 file demo, quyết định review đợt 3, file giải thích kho/gia hạn/ngân sách **bản 2** (kiểm độc lập 103 phép, 0 sai)                                                                                                                                                                                                                                                                                                                                      |
| Tool-service                       | `main` có portable setup + sửa tài liệu dùng thử (#1, #2). **Mọi việc tool dời sang đợt 8** (Owner 24/11): lịch tự chạy Task Scheduler, cờ khớp tài khoản đăng nhập với email công ty, câu gửi nội dung prompt (chưa làm)                                                                                                                                                                                                                                                                                                                                                                           |
| Vendor demo MF-5                   | Xong (QĐ-119). Owner cần **tạo site Jira Free** theo `Docs/Figma UI-UX/API-Integration/examples/mf5-usage-demo/HUONG-DAN-SETUP-VENDOR-DEMO.md` phần A (demo trong ~2 tuần)                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 2. Việc tiếp theo (theo thứ tự)

1. **Gộp bản sửa của Bảo** `origin/fix/redesign-w2-tech-t1-review` (`1fe5e345`) vào `int/redesign-w2` trên máy BE chính (Neon
   đã xong B9 — kiểm `git status` sạch, hỏi Owner về `FLOWS-V4-REPORT.md`): giải xung đột như §1, `pnpm openapi:export`,
   `pnpm arch:graph`, bộ kiểm nhanh (typecheck, lint, arch, rules, gates, unit `devices`/`licensing`), push, `gh workflow run
ci.yml --ref int/redesign-w2`. Đối chiếu bản sửa của Bảo với danh sách đã giao: F1 (Neon đã làm), R-2 (test vault khóa không
   xóa dòng PATCH), module-graph, R-7 (422 lượt ban đầu > trần; gói ACCOUNT lượt ban đầu > 0), fixture K3 `key_binding = NULL`,
   `licensing-assignment-read-contracts` 4 câu, R-1 D-14 `kind LICENSES`, R-3 mô tả, F2/R-4/R-5/R-6.
2. **Báo Bảo làm T6 + T7** trên nhánh của Bảo (merge `origin/int/redesign-w2` vào nhánh Bảo trước). Kèm luật cứng
   (`feedback_code_prompt_guard_rules`).
3. **Review + audit cuối đợt 2** khi T6/T7 xong (quy tắc Owner 24/11): Opus chia phần như đợt 1 (tech; biz tiền/quyền QĐ-118;
   luồng + merge audit), tự đọc phần rủi ro (migration, raw SQL, quyền, test bị sửa), đối chiếu tracker với code (Neon từng ghi
   "xong" quá tay: A1 H17, A4 B10h), **CI đầy đủ**; test mới của luật mới đỏ ⟹ sửa trong đợt; test cũ ⟹ FIX-TEST (đợt 8). Hỏi
   Owner các D-n "cần Owner" bằng AskUserQuestion — đang mở: Neon D-2 (`actingItAdmins` max 2), D-4 (sweeper chỉ bỏ cuối tuần, chưa
   ngày lễ), D-7 (nhắc hết hạn khi phòng không có IT không gửi Super Admin), D-8/D-9 B1 (tự chốt), và các D-n mới của B2…B9.
   Đã biết từ audit giữa đợt (B0→B1, Opus): không fake/hard-code; A1 H17 phải xong ở B2a/B4 (kiểm), A2 3 test `endSubstitute`
   `.expect(201)`, A3 chốt 403 theo W2-D19, A5–A11 dọn. Sau sửa: CI lần 2 ⟹ PR `int/redesign-w2` → `dev` (Owner squash, giữ
   `Co-authored-by` của Bảo).
4. **API description đợt 1 + 2** cho FE/Mobile (`Docs/Figma UI-UX/API-Integration/`), đối chiếu `openapi.json` trên `dev`.
   Kèm: `stockSummaryList` có `kind: 'LICENSES'`; `PATCH /devices/{id}`; route Super Admin đổi IT phụ trách thuê bao; mã lỗi mới.
5. **Đợt 3** sau khi đợt 2 vào `dev` và PR #84 merge: tạo `int/redesign-w3`, giao prompt `CODE-PROMPT.md` bản 2.3 cho Neon
   (biz) + Bảo (tech) theo PLAN (B1 → B2 → B3; P9 chỉ sau PR B1).
6. Đợt 4 (phiếu nhiều mục), 5 (AI — 6 tính năng BRD 6.4, CUT-5), 6, 7 (+ quyền theo vai `ROLE_RIGHT` bị bỏ khỏi đợt 3), **8 seed
   - Tool** (gom FIX-TEST, rà test CI, seed + gọi API D-1…D-4, nối Tool lên server, lịch tự chạy, cờ khớp tài khoản) ⟹ Prompt 4+6.
7. Ý tưởng Owner hỏi, chưa làm: máy bàn (`PC`) khi điều chuyển tự sinh việc thu máy (cần QĐ, cỡ S, đợt 7).

## 3. Quy ước (Owner)

- Tiếng Việt; **Skill Preflight** mỗi prompt. **Opus** mặc định cho spec/review/audit/docs; **Fable** chỉ cho luật tiền/ngân
  sách/quyền cực nặng (nêu lý do, Owner đồng ý trước — đã dùng một lần cho lượt tiền đợt 3); **Sonnet/Gemini** code. Khuyến nghị
  chỉ đưa Owner duyệt sau một reviewer độc lập. Hỏi Owner **từng câu** bằng AskUserQuestion, giải thích kỹ, có khuyến nghị; ghi
  `DECISIONS.md` ngay.
- Mọi prompt code có mục **LUẬT CỨNG** (`feedback_code_prompt_guard_rules`): không đổi hành vi ngoài SPEC (D-n "cần Owner");
  refactor giữ mọi lần kiểm; spec cạnh file + test lỗi khẳng định mã; không nới test/gate/manifest; gói hỏng lưu patch, không commit
  đỏ lên nhánh gộp; **orchestrator tự đọc `git diff` và đối chiếu từng tiêu chí trước khi ghi `xong`**; mỗi commit bộ kiểm nhanh +
  unit + 1–2 test quan trọng của luật mới; mô tả OpenAPI không mã nội bộ; với Neon: `--no-pager`, `$env:CI='true'`.
- Cuối **mỗi đợt**: review/audit sâu + **CI đầy đủ**; test mới của luật mới sửa trong đợt; test cũ ⟹ FIX-TEST đợt 8; không squash
  khi luật mới chưa có test xanh.
- Máy yếu: không full test trên máy; CI GitHub (`gh workflow run ci.yml --ref <nhánh>`). Push nhánh feature/int được; merge
  `dev`/`main`, deploy chỉ Owner (merge vào `int` khi Owner bảo). `dev` chỉ nhận squash. Commit identity sẵn có, **không**
  co-author/attribution AI.
- Docs: commit thẳng `main`, không push. Sổ QĐ **CRLF**; sau sửa BRD/QĐ/US chạy `docs-sync-check` (ERD FAIL có từ trước).
- Handoff chat điều phối luôn ở BE `docs/reviews/coordinator-<ngày>/HANDOFF-CHAT.md` (nhánh docs từ `origin/dev`, PR).
