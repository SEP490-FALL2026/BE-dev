# HANDOFF 2 — chat điều phối sau QĐ-113 (19/11/2026, rạng sáng)

Bổ sung cho [HANDOFF-CHAT.md](HANDOFF-CHAT.md) (đọc trước file đó). Chỉ ghi phần đã đổi.

## 1. Trạng thái đã kiểm (bằng `git`/`gh`)

| Hạng mục | Trạng thái |
| --- | --- |
| BE-WDP | `feat/qd113` đã merge `dev` (PR #59) → `main` (PR #60). CI `main` run `44342661915` xanh toàn bộ, **Build & Push image + Deploy to VPS over SSH = success** (~23:05 18/11). `main` có seed v4 (PR #57) + seed QĐ-113 (`8de4918c`, `dca70ba3`) |
| Deploy VPS | Đã deploy code. **Chưa biết** Owner đã chạy `seed.sh` chưa, và kết quả kiểm bước 1 (health 200 / organizations 0) — phải hỏi Owner |
| BE đồ án | `feat/qd113` @`3cbb2673` local, chưa push, không chạy CI (theo Owner). Nhánh `feat/seed-v4-expand` (seed v4 + audit 18/11) — kiểm Owner đã merge `dev` chưa |
| Docs `main` | Có các commit QĐ-113 + `9094f8a` (tài liệu FE seed v4) **chưa push**; working tree có `M Diagrams/main-workflows-activity-diagram/MF-2-offboarding-access-reclaim.drawio` không rõ của ai — hỏi Owner, không đụng |
| Worktree prunable | `Code/BE-WDP-wt/p2`, `p34`, `p6`, `p7`, `p8`, `Code/wdp-seed` (nhánh `feat/wdp-seed-v4` đã merge PR #57) — xóa khi Owner đồng ý |
| Docker local | `slm-seed` (55433, DB `slm_seed` đã seed seed-v4), `slm-seed-minio` (59000), `redis-server` — dùng cho audit seed, xóa được |

## 2. Việc còn lại (theo thứ tự)

1. **Hỗ trợ seed VPS:** Owner chạy `scripts/ops/seed.sh --app-dir <dir> --config <file 600> --confirm-reset <POSTGRES_DB>` (cấu hình có
   `SEED_ALLOW_RESET=true`), rồi `--continue` phải ra **exit 2**. Lỗi ⟹ đọc dòng XUNG ĐỘT/CHẶN/LỖI và `seed-reports/`, chẩn đoán trước,
   **không drop DB lần nữa** khi chưa rõ nguyên nhân. Lưu ý vận hành seed: [SEED-GUIDE](../../../../BE-dev-software-license-management/docs/reviews/seed-expansion-2026-11-17/SEED-GUIDE.md)
   (đường dẫn trong nhánh `feat/seed-v4-expand` của repo đồ án; bản sao ở BE-WDP `docs/reviews/seed-expansion-2026-11-17/SEED-GUIDE.md`):
   dữ liệu đúng tới **hết tháng seed**, seed lại **ngày trước mỗi buổi demo**, sáng demo chạy `--continue` (DEMO-14 + usage AI), chờ ~10 phút
   cho job; AI mặc định `SIMULATED` (Super Admin đổi `MODEL`).
2. **Duyệt Phần 2** của `D:\FPT\FALL2026\NOTE MD\QD-cho-duyet-truoc-prompt4.md` theo nhóm, hỏi từng quyết định bằng AskUserQuestion
   (tối đa 4 câu/lượt, có khuyến nghị đặt đầu): 2.1 (12 mục đã chọn ⟹ `QĐ-114`), 2.4 Prompt 3 (10 ĐỔI, 2 chọn, 42 Giữ), 2.3 Prompt 2,
   2.5 Prompt 5, câu mở **K1** (quyền `K1` kết thúc có giảm số lượng bản ghi thuê bao `K1` không), 2.7. Ghi sổ QĐ + BRD sau khi Owner đồng
   ý; chạy skill `docs-sync-check` trước khi báo đã đồng bộ. Seed: mục 2.6 đã chốt hết; NL-1/D-9 (chi phí từ go-live, **làm sau** luồng nhập
   dữ liệu lịch sử công ty trước khi có hệ thống — cần QĐ) nằm ở 2.1.
3. **Prompt 4:** 4a audit read-only toàn flow (Fable theo memory 16/11) ⟹ danh sách FIX; 4b FIX bằng Sonnet + DEMO + CI. Đưa vào 4b: `FR-5.10`
   tỷ lệ chi phí seat Trống (nợ), các mục [CHỜ] dời 4a/4b, ghost-seat-queue (`SoD-2`), transaction sửa thuê bao song song.
4. **Đồng bộ tài liệu** theo QĐ-113 + QĐ-114 (danh sách ở cuối Phần 1 file duyệt).
5. Dọn worktree, push Docs/nhánh BE đồ án **chỉ khi Owner bảo**.

## 3. Quy ước (Owner)

Như HANDOFF-CHAT §4: tiếng Việt, Skill Preflight; code = subagent Sonnet, review/verify = Opus; máy chỉ chạy kiểm nhanh không cần DB,
http/integration/e2e/seed chạy CI GitHub; được push nhánh feature, không push/merge `dev`/`main`; commit bằng git identity Owner, không dòng
co-author; Docs commit thẳng `main`, không push trừ khi được bảo. `prisma migrate reset` bị Prisma chặn khi do AI chạy ⟹ dùng DB/container
local dùng một lần (drop/create qua `psql`), không dùng biến consent.
