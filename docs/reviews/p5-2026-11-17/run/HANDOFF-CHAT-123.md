# Bàn giao chat điều phối "SEP-Start 123" → chat điều phối mới (17/11/2026 tối)

Đọc trước:
- `D:\FPT\FALL2026\CLAUDE.md`: trả lời tiếng Việt, Skill Preflight.
- Memory `project_prompt3_finish_decisions_2026_11_16.md` (các mục 17/11).
- Các `feedback_*` trong MEMORY.md, nhất là: code do Sonnet viết trong chat Owner mở; Opus chỉ điều phối và review; audit kỹ trước khi báo xong; suite đầy đủ chạy trên GitHub CI.

## 1. Prompt 5 — code XONG
| Repo | Nhánh @ commit | Tình trạng |
| ---- | -------------- | ---------- |
| BE đồ án `SEP490-FALL2026/BE-dev` | `feat/p5` @ `a3ad3039` | Gồm A2 + A1 + C + B, bản sửa lượt smoke (F1–F5, T1) và tài liệu review. CI đầy đủ xanh (run 44088867187 trên `fe91beb4`; `a3ad3039` chỉ thêm docs). Seed trên DB trống exit 0, 64 bước; `test:flows` 70 test qua, 0 lỗi. **Chưa merge `dev`.** |
| BE WDP `WDP301-FA26-GR8/BE` | `feat/wdp-p5` @ `1cb2d9ba` | Prompt 5 + MongoDB lịch sử AI (adapter cài port `AiInvocationHistoryStore`) + cùng bản sửa smoke (20 file giống hệt SEP). CI xanh tới `44fc9395`; `1cb2d9ba` mới qua kiểm nhanh ở local. Owner đang merge `dev` → `main` để deploy. |

- **Audit:** mỗi nhánh 1–3 vòng, biên bản `docs/reviews/p5-2026-11-17/run/AUDIT-*.md`. WDP ở `BE-WDP/docs/reviews/wdp-ai-history-2026-11-17/`.
- **Smoke và mutation:** `run/SMOKE-MUTATION.md`.
- **Quyết định đã chốt:**
  - F2 giữ quy ước path lỗi tiền: `MONEY_*` trả object tiền, `VALIDATION_ERROR` trả `<object>.amount`.
  - F5: badge và nhắc hạn của gói K1 để 4b.
- **Tài liệu API FE** (Docs `main`, chưa push):
  - đã đồng bộ tới `d3757876` (7 commit `bbb13d6`…`5589dba`, `--check` OK);
  - subagent đang cập nhật theo `a3ad3039`: target theo vai, quy ước path, câu tiếng Anh, giải thích phòng `ADMIN` của Super Admin.
- **Hướng dẫn deploy AI (Modal):** `docs/reviews/p5-2026-11-17/AI-DEPLOY-GUIDE.md`; bản sao ở BE-WDP.

## 2. Việc còn mở
1. **Deploy WDP (Owner):** merge `main`, deploy Modal, seed lại VPS (reset). Sau deploy cần theo dõi và hỗ trợ.
2. **Repo đồ án:** Owner merge `feat/p5` → `dev`. Sau đó xóa các nhánh chỉ dùng để chạy CI:
   - đồ án: `feat/p5-a1-sbf20`, `feat/p5-a2-fixes`, `feat/p5-b-messages`, `feat/p5-c-ai`;
   - WDP: `feat/wdp-ai-history`.

   Không đụng `Bao_dev_be`, `review-2`, `test`, `feat/AI-services` khi chưa hỏi Owner.
3. **Seed mở rộng — mới có SPEC/PLAN, CHƯA CODE.**
   - Thư mục: `docs/reviews/seed-expansion-2026-11-17/` gồm `SPEC.md`, `PLAN.md`, `SEED-AUDIT.md`, `REVIEW-SPEC.md`, `REVIEW-SPEC-2.md`, `SEED-PROMPT.md`. Thư mục này **chưa commit**.
   - Spec đã qua 2 vòng review; Owner đã chốt Q1–Q7, Q-A…Q-E (ghi ở cuối `SPEC.md`).
   - Owner mở một chat Sonnet và dán: `Đọc và làm theo …\seed-expansion-2026-11-17\SEED-PROMPT.md. Subagent code: model sonnet.`
   - Chat seed làm trên nhánh `feat/seed-v4-expand`, tạo từ `feat/p5` mới nhất.
   - Chat seed báo `SEED XONG` thì điều phối audit; seed nhất là tệp thật (Excel/PDF có dấu) và số liệu báo cáo khớp. Sau đó đưa sang WDP bằng patch.
4. **Owner duyệt QĐ của prompt 2/3/5** để đồng bộ Docs (BRD/QĐ/sơ đồ). Các D-n chờ duyệt nằm ở `run/MORNING-REPORT.md` và các `*-DONE.md`. Sau đó làm **prompt 4** (4a Fable audit sâu, 4b Sonnet sửa).
5. **Nhánh local cũ chưa merge**, hỏi Owner có giữ không: `feat/native-schema`, `feat/qd93-unplaced-employee-first-placement`, `ci-trial/deploy-gate`.
6. **Thư mục rỗng bị khóa** `Code/be-p5-a2` và `Code/verify-logs/p5`: xóa sau khi khởi động lại máy.

## 3. Môi trường
- Hai thư mục BE: `Code/BE-dev-software-license-management` (`feat/p5`) và `Code/BE-WDP` (`feat/wdp-p5`). Không còn worktree phụ.
- Docker:
  - `slm-p5-seed` 55432: DB `slm_smoke` đã seed bản `d3757876`;
  - `slm-p5-c` 35444: DB test;
  - `redis-server`.
- Script dựng DB test: `C:\Users\Asus\AppData\Local\Temp\claude\cb9d99d994b36370\7eb159d2-d9bb-4061-8261-d8e89677a8a4\scratchpad\make-test-db.sh <tên> <cổng>`. Thư mục scratchpad có thể bị dọn; nếu mất, nội dung script là: Postgres 17 tmpfs, user `ci_bootstrap`, tạo role `ci_integration` CREATEDB.
- Quyền Owner đã cấp:
  - push nhánh tính năng và chạy/sửa CI ở cả hai repo BE;
  - commit đứng tên "Chill", không dòng đồng tác giả AI;
  - không merge/push `dev`/`main`, không deploy.
  - Docs: commit `main`, không push.

## 4. Cập nhật lúc 20:55
- **Repo đồ án:** Owner đã merge `feat/p5` vào `dev` (PR 55, `dev` @ `32cf808b`).
  - Thư mục chính `Code/BE-dev-software-license-management` đang ở `dev`.
  - Có thể xóa các nhánh chỉ dùng để chạy CI (mục 2.2).
- **Tài liệu API FE:**
  - Docs `main` @ `aa09f0b`, Owner tự push.
  - `--check` OK theo `dev` `32cf808b`, revision README đã sửa.
- **Repo WDP:**
  - PR #54 `dev` → `main` báo *conflicting*. Lý do: `main` có commit merge PR #52 mà `dev` không có; nội dung giống hệt, merge thử ở local thì sạch.
  - Điều phối đã push nhánh `chore/sync-main-into-dev` (merge `main` vào `dev`, 0 file đổi; worktree tạm `Code/wdp-sync`).
  - Owner merge nhánh đó vào `dev`, rồi merge #54 để deploy.
  - Sau đó: seed lại VPS (`seed.sh`, `SEED_ALLOW_RESET=true`, gõ tên DB), bật AI.
  - Xong thì gỡ worktree `wdp-sync`, xóa nhánh `chore/sync-main-into-dev` và `feat/wdp-ai-history`.
- Owner đã deploy AI trên Modal.
