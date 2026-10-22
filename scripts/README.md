# Development scripts

Thư mục root scripts/ chứa công cụ hỗ trợ dev/CI; không chứa business service.
Scripts không tự chạy khi API nhận request. package.json khai lệnh gọi chúng.

| File                                | Lệnh                                             | Trách nhiệm                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check-rules.mjs                     | pnpm rules:check                                 | Kiểm tra link và quan hệ instruction trong rules-check.config.json; kiểm cấu trúc work item (mục bắt buộc, pin, trạng thái, primary Story, trường task, đăng ký) trừ danh sách `legacy`         |
| check-rules.test.mjs                | pnpm rules:test                                  | Regression cho checker                                                                                                                                                                          |
| dev/export-openapi.ts               | pnpm openapi:export                              | Tạo Nest app không listen trong môi trường chỉ cho export (`dev/export-environment.ts`: secret E3 sinh trong bộ nhớ, không đọc `.env`, không đặt `NODE_ENV`), sinh openapi.json rồi đóng app    |
| dev/download-translation-models.mjs | node scripts/dev/download-translation-models.mjs | Tải public model artifact cho translation research vào OFFLINE_TRANSLATION_MODELS_DIR (mặc định .models/translation)                                                                            |
| ops/postgres-backup-retention.sh    | qua SSH trên host, xem containers guide          | DB-05: giữ 10 bản sao lưu trước migration mới nhất và mọi bản dưới 30 ngày; dry run trừ khi `--apply`; chỉ thư mục `…/backups/postgres`, đúng mẫu tên. Không có lệnh pnpm vì host không có pnpm |
| verify/backup-retention.test.mjs    | pnpm test:scripts                                | Regression của script retention trên thư mục tạm (dry run, `--apply`, biên 10/30 ngày, tên lạ, từ chối thư mục sai)                                                                             |
| verify/runners.mjs                  | Đọc bởi discovery                                | Registry runner, suffix, thư mục                                                                                                                                                                |
| verify/check-script-order.test.mjs  | pnpm test:scripts                                | Regression: `check` generate Prisma client trước lint; CI path filter                                                                                                                           |
| verify/pg-deprecation.test.mjs      | pnpm test:scripts                                | INF.1: spec adapter PostgreSQL chạy với `--throw-deprecation`, 0 cảnh báo deprecation của pg                                                                                                    |
| verify/test-layout.mjs              | Đọc bởi discovery                                | Logic phát hiện layout sai                                                                                                                                                                      |
| verify/test-layout.test.mjs         | pnpm test:scripts                                | Regression layout                                                                                                                                                                               |
| verify/verify-test-discovery.mjs    | pnpm test:discovery                              | Đối chiếu file trên disk với Jest --listTests                                                                                                                                                   |

## Translation research

`@huggingface/transformers` chỉ dùng trong translation spike, không có consumer trong API/worker.
Dependency này nằm trong `devDependencies`; `pnpm install` cài nó cho môi trường dev,
còn runtime image dùng `pnpm install --prod` nên không mang transformers/sharp.
Script tải model ở trên dùng Node fetch, không cần transformers.

Để chạy benchmark 3.8.1 bằng dependency dev, từ repo root đặt `SPIKE_DEPS_DIR` bằng
đường dẫn repo và `SPIKE_MODELS_DIR` bằng đường dẫn model offline, sau đó chạy
`node docs/workspace/items/dynamic-content-translation/spike/quality/run-benchmark.mjs --direction vi-en --mode protected --limit 1 --warmup 0 --repetitions 1 --out <file-ngoài-repo>`.
Các lệnh benchmark và tùy chọn output đầy đủ nằm trong
[quality spike README](../docs/workspace/items/dynamic-content-translation/spike/quality/README.md#how-to-run);
dùng output ngoài repo khi chạy kiểm tra cục bộ. Candidate version khác cài riêng theo
[dependency spike README](../docs/workspace/items/dynamic-content-translation/spike/deps/README.md).

## Targeted mutation verification

`pnpm test:mutation` chạy `verify/targeted-mutation.mjs`: control xanh cho mọi probe rồi đúng ba mutant cố định
(N-1 disposal, authorization, invitation invalidation). Cần development dependencies, Prisma client đã generate và
`TEST_DATABASE_ADMIN_URL` trỏ PostgreSQL 17 riêng với role thường theo [test guide](../test/README.md).
Runner không tự đọc `.env` và không mutate checkout đang làm: nó copy cây hiện tại vào OS temp, loại `.env*`,
liên kết dependencies rồi chạy Jest bằng Node. Mỗi patch phải khớp đúng một lần; finally khôi phục bytes/hash,
đối chiếu toàn bộ owner manifest và dọn copy có kiểm tra đường dẫn. Không chạy đồng thời với việc sửa owner tree.

JSON summary phân biệt `KILLED`, `SURVIVED`, `SETUP_ERROR`, `CONTROL_FAILED`, `UNAPPLIED`, `RESTORE_FAILED`.
Exit 0 chỉ khi ba mutant bị assertion bắt, restore đúng, owner không đổi và cleanup đạt; exit 1 của Jest hoặc
lỗi setup không tự tính là killed. Không lưu raw child output vào repo. Test runner nằm ở
`verify/targeted-mutation.test.mjs` và được `pnpm test:scripts` thu nhận; không phải mutation score toàn dự án.

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
