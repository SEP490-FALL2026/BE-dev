# Quy ước chuyên đề

Workflow chung ở [CONTRIBUTING](../../CONTRIBUTING.md), cấu trúc source ở
[ARCHITECTURE](../../ARCHITECTURE.md). Đọc chuyên đề khi task chạm tới nó.

| Thay đổi                              | Quy ước                                         |
| ------------------------------------- | ----------------------------------------------- |
| Thêm/di chuyển file, capability, lỗi  | [Module structure](module-structure.md)         |
| Controller, DTO, OpenAPI              | [API contract](api-contract.md)                 |
| Query, schema, transaction, nghiệp vụ | [Database/business](database-business.md)       |
| Auth, file, job                       | [Security/jobs](security-jobs.md)               |
| Tài liệu, ADR                         | [Documentation](documentation.md)               |
| Chia việc thành hạng mục, spec/plan   | [Work-item sizing](work-item-sizing.md)         |
| Lệnh vận hành ngoài HTTP, seed local  | [Operational commands](operational-commands.md) |

Không cần thêm một `RULES.md` khác hoặc sao chép các quy ước này sang từng công cụ AI.
[AGENTS](../../AGENTS.md) chỉ định tài liệu cần đọc theo tác vụ.
`pnpm rules:check` kiểm tra link/import của bộ tài liệu đang dùng;
`pnpm rules:format` kiểm tra format. Danh sách file nằm trong
[rules-check.config.json](../../rules-check.config.json).
