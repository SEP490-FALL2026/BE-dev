# Development scripts

Thư mục root scripts/ chứa công cụ hỗ trợ dev/CI; không chứa business service.
Scripts không tự chạy khi API nhận request. package.json khai lệnh gọi chúng.

| File                             | Lệnh                | Trách nhiệm                                                        |
| -------------------------------- | ------------------- | ------------------------------------------------------------------ |
| check-rules.mjs                  | pnpm rules:check    | Kiểm tra link và quan hệ instruction trong rules-check.config.json |
| check-rules.test.mjs             | pnpm rules:test     | Regression cho checker                                             |
| dev/export-openapi.ts            | pnpm openapi:export | Tạo Nest app không listen, sinh openapi.json rồi đóng app          |
| verify/runners.mjs               | Đọc bởi discovery   | Registry runner, suffix, thư mục                                   |
| verify/test-layout.mjs           | Đọc bởi discovery   | Logic phát hiện layout sai                                         |
| verify/test-layout.test.mjs      | pnpm test:scripts   | Regression layout                                                  |
| verify/verify-test-discovery.mjs | pnpm test:discovery | Đối chiếu file trên disk với Jest --listTests                      |

## Khi thêm script

Đọc [AGENTS](../AGENTS.md), [documentation rules](../docs/rules/documentation.md)
và rule chuyên đề liên quan. AGENTS áp dụng toàn repo, bao gồm scripts/ và test/.

- Đặt tên/mục đích rõ, thêm command vào package.json và ghi input/output ở đây.
- Validation sai phải exit nonzero; không nuốt lỗi để CI xanh.
- Không chứa business logic đáng lẽ thuộc module; gọi public service khi thật sự cần.
- Không hardcode credentials, in token hoặc dump dữ liệu thật.
- Script chạm DB phải kiểm tra đúng target; thao tác phá hủy cần opt-in và ownership.
- Đóng app/client trong finally. Test script có logic quyết định hoặc thao tác dữ liệu.
- Không tạo công cụ trace/spec phụ thuộc một kế hoạch dự án đã bỏ.
