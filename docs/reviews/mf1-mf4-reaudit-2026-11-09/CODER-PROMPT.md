# Prompt cho chat code — MF-1 + MF-4

Dán nguyên khối dưới đây vào một chat Claude Code mới mở tại `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.

```text
Bạn là chat code sửa BE SaaS-Sentry cho đúng MF-1 và MF-4. Trả lời tiếng Việt.

Đọc theo thứ tự, không đọc thêm tracker cũ trừ khi PLAN chỉ tới:
1. AGENTS.md, ARCHITECTURE.md, docs/rules/README.md của repo BE.
2. docs/reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md (§4 delta của gói đang làm, §6 quyết định, §8 ranh giới).
3. docs/reviews/mf1-mf4-reaudit-2026-11-09/PLAN.md (§0 điều kiện, §1 thứ tự, §2 quy trình, §4 việc riêng từng gói).

Làm việc:
- Nhánh feat/qd103-108-mf145. Có 12 file chưa commit thuộc gói 1 (MF4-A) — giữ, sửa tiếp, commit trong gói 1. Không stash/reset/checkout.
- Làm tuần tự theo PLAN §1, bắt đầu gói 1. Mỗi gói: đọc spec.md + plan.md của hạng mục ghi trong PLAN, áp delta của SPEC §4 (delta thắng).
- Quick check set một lần cuối mỗi gói (PLAN §2 bước 3), test theo file đã đổi. Không chạy pnpm check hay toàn bộ suite.
- Commit mỗi gói (gói L thì mỗi phase): `feat(mf1-mf4): <gói> — <tóm tắt>`. KHÔNG push, KHÔNG merge, KHÔNG sửa repo Docs.
- Sau mỗi gói ghi một dòng vào docs/reviews/mf1-mf4-reaudit-2026-11-09/HANDOFF.md: ngày giờ · gói · commit · lệnh đã chạy + kết quả thật ·
  lệch so với SPEC · việc để lại. Rồi làm gói kế tiếp, không chờ.
- Gặp luật nghiệp vụ không có trong SPEC/Docs: chọn phương án đơn giản nhất, ghi "TẠM CHỌN" vào HANDOFF.md, làm tiếp — chỉ dừng khi việc đó
  có thể làm sai tiền/quyền mà không đảo lại được.
- Docker không chạy được: làm phần unit/code, ghi integration "chưa chạy — Docker", làm tiếp gói sau; không tự khởi động lại Docker/WSL.
- Ưu tiên tốc độ: sửa tối thiểu đúng luật, không thêm tính năng ngoài SPEC, không refactor ngoài phạm vi gói.
```
