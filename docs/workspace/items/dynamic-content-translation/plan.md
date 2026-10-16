# Plan: dịch nội dung động EN–VI

- [Spec](spec.md); revision đã review: chưa review (draft lượt 3, 15/10/2026).
- Implement: chưa giao. Reviewer: dev khác.
- Triển khai: not-started. PR: chưa có.
- **Trạng thái: research kết thúc với kết quả âm tính.** Spike (bước 0, 0b) đã chạy và tái chạy được ở [spike/](spike/README.md).
  - Chất lượng không đạt ở vi→en và chưa đạt để bật ở en→vi.
  - Đề xuất giữ disabled/pending. Các bước 1–5 chỉ bắt đầu khi Owner/dev chọn hướng và đủ điều kiện ở mục _Trước khi code_.
  - Hạng mục này không chặn G1 hay remediation.

## Trước khi code

- Đọc AGENTS.md, CONTRIBUTING.md, [API contract](../../../rules/api-contract.md), [security rules](../../../rules/security-jobs.md), [test guide](../../../../test/README.md) và spec G5 đã review.
- Điều kiện bắt buộc (đều đang **chưa đạt**):
  1. Docs đã ghi `QĐ-74` (hoặc số còn trống) và cập nhật BRD/US/Logical theo [source-sync](source-sync.md); snapshot có hash.
  2. Contract dịch đã được dev review cùng contract G5; lát G5 có Request, bước duyệt và cột mã ngôn ngữ.
  3. Gói [`g0-g1-remediation-after-rereview`](../g0-g1-remediation-after-rereview/spec.md) đã merge và kiểm lại (N-1, R-15, R-13).
  4. Ngưỡng chất lượng T1–T8 được Owner/dev chốt và đạt trên 4.3.1, hoặc có quyết định chỉ bật một chiều.
  5. License dữ liệu huấn luyện đã được Owner/pháp lý xem.
- Không sửa `TransactionRunner`, `prisma.service.ts` hay cấu hình DB. Không gộp với PR remediation.
- Thay đổi dependency 3.8.1 chưa commit trong working tree là của phiên khác. Người nhận quyết định cách thay bằng 4.3.1 trong PR của hạng mục, không xóa hay revert tùy tiện.

## Các bước

- [x] **Bước 0 — spike cô lập** (14/10/2026; code và evidence nằm dưới `spike/`, không phải code product):
  - [x] Ma trận dependency, audit, Linux install + smoke offline ([spike/deps](spike/deps/README.md)).
  - [x] Benchmark chất lượng 2 × 84 câu, raw và có bảo vệ ([spike/quality](spike/quality/README.md)).
  - [x] Tiến trình con, supervisor, single-flight, cache, đo trên Linux ([spike/runtime](spike/runtime/README.md)).
  - [x] Kết quả và giới hạn ghi ở [research](research.md).
- [x] **Bước 0b — khép review spike V-1 → V-5** (15/10/2026):
  - [x] Chạy lại `spike/quality` trên 4.3.1 qua adapter (tra id token ngôn ngữ, `forced_eos_token_id: null`), segment 128 token, cổng cực tính, fallback cả trường. Chạy 168 câu chính và 105 câu held-out đóng băng trước khi chạy.
  - [x] Sửa runtime: spawn lỗi, đồng hồ tính từ `run`, cắt cụt, hook `res` `close`, nguồn hiệu lực, lock probe, runner có ownership. Chạy thật trên Windows và Linux.
  - [x] Bảng license theo artifact; tách flag tự động / AI phân xử / người duyệt.
- [ ] **Bước 0c — việc chờ Owner/dev (external gate):**
  - Chọn: giữ disabled/pending, hoặc chỉ en→vi.
  - Người duyệt gold set.
  - Chốt ngưỡng; license; `mul`.
  - Quyết lock kiểm một lần hay mỗi lần respawn.
  - Định danh và sửa test runtime flaky.
- [ ] **Bước 1 — dependency (PR riêng):**
  - Đổi sang `@huggingface/transformers@4.3.1` exact; override `'@huggingface/transformers>onnxruntime-web': '-'`; `allowBuilds` false cho `onnxruntime-node`/`sharp`, bỏ mục `protobufjs`.
  - Kiểm: `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level high` (exit 0), `pnpm why sharp` (0.35.5), `pnpm check`.
  - Review diff lockfile.
- [ ] **Bước 2 — lõi thuần (TDD, `src/core` hoặc `src/infrastructure/translation`):**
  - Phân giải `Accept-Language` theo bảng spec; segmenter 128 token; placeholder/glossary/cổng; cổng cực tính; ánh xạ status/reason.
  - Viết test trước, thấy fail đúng lý do rồi mới implement. Lệnh: `pnpm test`.
- [ ] **Bước 3 — supervisor, tiến trình con, cache, lock:**
  - Port từ thiết kế spike, không copy nguyên văn mà viết lại theo TDD.
  - `model-lock.json` từ bảng hash ở research.
  - Kiểm lock; env offline; tripwire `fetch`; tự kiểm id token ngôn ngữ.
  - Thêm biến `TRANSLATION_*` vào `env-schema.ts` **sau** khi remediation merge.
  - Integration với model thật bỏ qua có thông báo khi thiếu model. Lệnh: `pnpm test`, `pnpm test:integration`.
- [ ] **Bước 4 — route trong module G5:**
  - Allowlist, DTO Zod (params/query/response), `@ApiSuccessResponse`.
  - Kiểm quyền dùng lại logic route chi tiết, trước khi tra cache.
  - Header `Vary`/`Content-Language`/`Cache-Control`; budget riêng; cập nhật [API inventory](../../../../test/support/api-coverage-manifest.ts).
  - Lệnh: `pnpm test:e2e`, `pnpm openapi:export`, review diff `openapi.json` (không có 406).
- [ ] **Bước 5 — đóng gói và bàn giao:**
  - Build stage `translation-models` kiểm theo lock; `.models` vào `.dockerignore`.
  - Kiểm `docker build` và `docker run --network none --read-only --tmpfs /tmp`.
  - Báo FE operation/schema mới; cập nhật ARCHITECTURE và roadmap.

## Rollback

- Đặt `TRANSLATION_ENABLED=false`: mọi lần gọi trả `DISABLED` kèm bản gốc, không spawn tiến trình con.
- Gỡ dependency bằng một PR revert riêng; không ảnh hưởng dữ liệu vì không lưu bản dịch.
- Cột mã ngôn ngữ thuộc migration G5 và đi theo rollback của G5.

## Kiểm chứng và bàn giao

Chạy từ gốc BE theo CONTRIBUTING.md và test/README.md. Tài liệu: `pnpm rules:check`, `pnpm rules:format`.

| Lệnh / kiểm tra                                       | Revision / môi trường                   | Kết quả thực chạy                                                                                                                 | Giới hạn                                |
| ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `node --test` trong `spike/quality`                   | Windows, Node 24.0.1                    | 14/10: 82/82. 15/10: 159 pass + 3 skip; `SPIKE_REAL=1` adapter 22/22; freeze `--check` OK (coordinator chạy lại)                  | Code spike, không phải product          |
| `node --test "test/*.test.mjs"` trong `spike/runtime` | Windows, Node 24.0.1                    | 15/10: 180 pass + 8 skip ở 4/5 lần; 1/5 lần có 2 fail (flaky, chưa định danh). B báo `SPIKE_REAL=1` 188/188 trên Windows và Linux | Flaky phải sửa trước khi làm gate       |
| Benchmark 4.3.1 (168 + 105 câu)                       | Windows, 4.3.1, lock `1492a4ed…`        | Âm tính — [research](research.md#vòng-cuối-trên-431-15102026)                                                                     | Tham chiếu AI soạn; chưa có người duyệt |
| Ma trận dependency + audit                            | Clone `a8ba88f` + working tree; scratch | Xem [spike/deps](spike/deps/README.md)                                                                                            | Lockfile product chưa đổi               |
| Linux `node:24-bookworm-slim` `--network none`        | Docker 29.1 linux/amd64                 | Cài và dịch offline được với 3.8.1 và 4.3.1                                                                                       | Chưa build Dockerfile product           |
| Spike runtime                                         | Linux container + Windows               | Xem [research](research.md#kết-quả-runtime)                                                                                       | Code spike                              |
| `pnpm rules:check`, `pnpm rules:format`               | Working tree 14/10 và 15/10/2026        | Ghi ở báo cáo phiên                                                                                                               | Không chứng nhận nội dung               |

- [ ] AC trong scope có bằng chứng của implementation product (spike không thay được).
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR; ghi merged/accepted chỉ sau sự kiện thật.
