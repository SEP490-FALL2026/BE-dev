# Dùng AI trong repo backend

Mọi dev dùng cùng [CONTRIBUTING](../../CONTRIBUTING.md) và
[ARCHITECTURE](../../ARCHITECTURE.md). AI có điểm vào ngắn là [AGENTS](../../AGENTS.md).
Không cần cài skill/plugin riêng để góp code.

## File và cách nạp

| Công cụ                       | File của repo     | Cách dùng                                             |
| ----------------------------- | ----------------- | ----------------------------------------------------- |
| Codex                         | `AGENTS.md`       | Mở/chạy từ gốc BE; kiểm tra root và working directory |
| Claude Code                   | `CLAUDE.md`       | Import `@AGENTS.md`                                   |
| Gemini CLI                    | `GEMINI.md`       | Import `@./AGENTS.md`                                 |
| Cursor Agent                  | `AGENTS.md`       | Hướng dẫn chung; rule database chỉ nạp khi path khớp  |
| Copilot/Windsurf nếu còn dùng | Adapter tương ứng | Dẫn đến AGENTS; không có bộ quy tắc riêng             |

Cursor scoped rule: [database.mdc](../../.cursor/rules/database.mdc).
Không dùng `.cursorrules` cho setup mới. Cơ chế do ứng dụng quyết định:
chọn model Claude trong Cursor vẫn dùng cơ chế context của Cursor.

## Kiểm chứng trên máy contributor

1. Mở phiên mới tại đúng repo BE sau khi đổi file hướng dẫn.
2. Codex: yêu cầu liệt kê nguồn instructions đang áp dụng; kiểm tra có AGENTS của repo.
3. Claude Code: `/context`, kiểm tra Memory files và nội dung import.
4. Gemini CLI: `/memory show` kiểm tra context; `/memory reload` nếu cần nạp lại.
5. Cursor Agent: kiểm tra rule trong giao diện; thử task chạm một repository hoặc Prisma schema.
6. Giao task chỉ đọc: giải thích controller → service → repo và lệnh test từ tài liệu.

Repo check xác minh file/import/link tồn tại; nó không chứng minh từng sản phẩm AI
đã nạp context hoặc sẽ tuân thủ. User/global/organization instructions có thể ảnh
hưởng phiên làm việc; kiểm tra chúng nếu hành vi khác mong đợi.

Claude Code mới có thể nạp AGENTS trực tiếp, tùy phiên bản/settings và sự hiện diện
CLAUDE.md/CLAUDE.local.md. Import ở đây giữ đường vào rõ ràng cho team dùng nhiều phiên bản.
Gemini cũng có thể đổi `context.fileName`; repo này dùng import, không cần cấu hình đó.

## Viết rule mới

Giữ quy tắc chung ở nguồn sở hữu, rồi liên kết từ AGENTS khi có tác vụ cần.
Không import toàn bộ docs/ADR vào mọi phiên; không sao chép rule sang bốn file.
Linter/test/CI kiểm tra điều có thể tự động hóa. Review code vẫn cần thiết.

Nguồn chính thức, đối chiếu 2026-10-07:

- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Claude Code memory/imports](https://code.claude.com/docs/en/memory)
- [Gemini CLI context](https://geminicli.com/docs/cli/gemini-md/)
- [Cursor rules](https://cursor.com/docs/rules)
