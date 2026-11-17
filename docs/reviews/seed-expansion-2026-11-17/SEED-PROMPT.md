# SEED-v4-EXPAND — mở rộng seed demo (điều phối 123 giao, 17/11)

Chat code Sonnet, effort high. Trả lời tiếng Việt; giữ tiếng Anh cho code, đường dẫn, lệnh.
**Subagent code: model sonnet** — mỗi gói một subagent, chạy tuần tự.

## 0. Đọc trước
1. Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`: process + test/debug + verification-before-completion. Đọc `SKILL.md` của từng skill và liệt kê ở đầu báo cáo.
2. `AGENTS.md` của BE và `docs/rules/operational-commands.md`. Đọc thêm `docs/guides/seed.md`, `test/README.md`.
3. Thư mục `docs/reviews/seed-expansion-2026-11-17/`:
   - `SPEC.md` — nguồn chính. Đã áp Review 1 và Review 2; các quyết định Owner Q1–Q7, Q-A…Q-E nằm ở cuối file.
   - `PLAN.md` — T0…T29, checkpoint CP1–CP6.
   - `REVIEW-SPEC.md`, `REVIEW-SPEC-2.md` — lý do của từng chỗ đã sửa.
   - `SEED-AUDIT.md`.

   **Spec thắng** khi lệch với review hay audit. Không sửa các file trong thư mục này; chỗ nào lệch thì ghi `D-n`.

## 1. Nơi làm
- **Repo và nhánh:**
  - Repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
  - Tạo nhánh `feat/seed-v4-expand` từ `feat/p5` mới nhất (đã có các FIX smoke tới `0f086c61` hoặc mới hơn). Dùng worktree riêng `Code/be-seed` để không đụng thư mục chính.
- **Commit và push:**
  - Mỗi task một commit; tên git "Chill", không dòng đồng tác giả AI, không `--no-verify`.
  - Được push `feat/seed-v4-expand` và chạy `gh workflow run ci.yml --ref feat/seed-v4-expand`.
  - **Cấm** merge/push `dev`/`main`, deploy, sửa Docs.
- **Hạ tầng local:**
  - DB demo riêng: `make-test-db.sh slm-seed 55433`, rồi tạo DB `slm_seed` với owner `ci_integration`.
  - `.env.seed.local`: chép từ thư mục chính, đổi `DATABASE_URL`.
  - Seed cần object storage cho upload: dựng MinIO từ `infra/minio`, đặt `OBJECT_STORAGE_*` giả vào `.env.seed.local`. File này không commit.
  - DB test cho integration: `make-test-db.sh slm-seed-test 35446`.
- **Font (T1b):** cần mạng để tải Noto Sans + `OFL.txt`. Không có mạng thì dừng và báo điều phối.

## 2. Cách chạy test (đẩy nhanh)
- **Mỗi task:** typecheck, lint, test seed liên quan (unit/integration của `src/cli/seed`), `test:gates`, `arch:check`.
- **Mỗi checkpoint CP:**
  - seed trên DB trống (`pnpm seed:local -- --confirm-reset slm_seed` hoặc DB vừa tạo);
  - chạy lại cùng ngày, phải ra **exit 2**;
  - `pnpm test:flows`.
  - Với CP2/CP5: thử thêm ngày **D0+1** bằng đồng hồ giả như PLAN ghi (sửa N-1 ở T16b).
- **Suite đầy đủ:** chỉ chạy trên GitHub CI, ở cuối mỗi đợt và sau mỗi lần sửa.
- Không bỏ T9b, T16b, T29/CP6 (script kiểm tổng tài chính).

## 3. Quyết định mở
- Chỉ ghi `D-n` khi spec không trả lời: nêu phương án, khuyến nghị, căn cứ QĐ.
- Chọn phương án an toàn, không trái QĐ, rồi làm tiếp.
- Chỉ dừng khi bị chặn thật.

## 4. Báo cáo
Ghi `docs/reviews/seed-expansion-2026-11-17/SEED-DONE.md`, gồm:
- skill đã dùng;
- bảng task → commit → lệnh → kết quả thật;
- kết quả từng CP: số bước ĐÃ GHI/ĐÃ CÓ, exit code, `test:flows`, script kiểm tài chính;
- link CI;
- `D-n`;
- tài khoản demo theo vai;
- việc tài liệu FE cần sửa, gồm demo README và giải thích phòng `ADMIN`;
- mục "Chưa làm".

Xong thì nhắn `SEED XONG` cho "SEP-Start 123: reseach,review,plan - fix main flows 2-3" và DỪNG. Điều phối sẽ audit, rồi chạy T28 (đưa sang WDP) hoặc giao lại.
