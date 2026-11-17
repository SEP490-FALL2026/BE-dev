# P5-C — AI, chỉ BE (chat "SEP-Start 88: P5-C AI-BE")

Đọc và làm theo `D:\FPT\FALL2026\Code\verify-logs\p5\P5-COMMON.md` trước. Tên báo cáo: `C-DONE.md`, mã chat `C`.

| Mục | Giá trị |
| --- | ------- |
| Worktree / nhánh | `D:\FPT\FALL2026\Code\be-p5-c` / `feat/p5-c-ai` |
| Spec | `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\p5-2026-11-17\SPEC-5C-AI.md` — **chỉ** A1, A2, A5 (phần BE), A7, A8 và B-Task BE **C1–C5** |
| Migration | `20261117120000_ai_provider_mode` (đổi tên từ `20261109100000` của `Bao_dev_be`) |
| DB test | `make-test-db.sh slm-p5-c 35444` |

Lưu ý:
- Owner 17/11: AI service = bản WDP (`WDP301-FA26-GR8/AI-service`, Qwen3.5-4B trên Modal) cho cả hai BE. **Bỏ** A3/A4 và B-Task AI repo (S1–S6),
  **không** đụng repo `AI-module-SEP`.
- SEP **không** dùng MongoDB (QĐ-102h, QĐ-79c): lịch sử AI giữ trong PostgreSQL; chỉ thêm port `AiInvocationHistoryStore` (5C-Q3 = A: trả
  `record | null`) để WDP gắn adapter Mongo sau. 5C-Q1/Q2 = A.
- Contract với AI service phải khớp bản WDP (đọc `D:\FPT\FALL2026\Code\Ai-service-WDP` nếu cần đối chiếu request/response, timeout, token).
