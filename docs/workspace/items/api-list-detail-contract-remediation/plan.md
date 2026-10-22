# Plan: quy tắc và gate collection/detail (`API-LIST-DETAIL.1`)

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [API contract](../../../rules/api-contract.md), `test/e2e/api-inventory.e2e-spec.ts` và
ma trận ở [review mục 4](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#4-collection-và-detail-api-list-detail1).
Đối chiếu registry khởi đầu với BE revision lúc bắt đầu: hạng mục capability nào đã merge thì bỏ mục của nó. Nếu gate đọc
`openapi.json` đã commit, chờ `delivery-gate-hardening` Task 1 (xuống dòng) hoặc chuẩn hóa EOL trong gate.

## Tasks

### Task 1: rule `API-LIST-DETAIL.1`

- Files: `docs/rules/api-contract.md` (mục _Collection và detail_ với 8 điều, Good/Bad/Bad workaround), `docs/rules/README.md`
  nếu có chỉ mục, `docs/workspace/_template/spec.md` (một dòng nhắc khai summary/paging/order/detail cho collection mới).
- Depends on: none.
- Acceptance: `LD-R1`.
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh.

### Task 2: inventory gate + registry chính xác

- Files: `src/api-collection-contract.spec.ts`, `src/api-collection-contract.registry.ts` (mỗi mục: `operationId`, loại
  `detail-reuse`/`bounded`/`unpaged-scan`/`snapshot`, lý do, chủ, điều kiện gỡ, `businessMaximum` khi `bounded`).
- Depends on: Task 1.
- Acceptance: `LD-R2` — bốn ca đỏ của test matrix đỏ đúng lý do trên fixture; 61 `GET` hiện có xanh với registry khởi đầu.
- Verify: chạy gate với từng fixture vi phạm (đỏ trước) rồi registry thật (xanh); `pnpm check`.

### Task 3: harness đếm query/projection

- Files: `test/support/query-count.ts` (≤ 400 dòng, không assertion — rule `TEST-HARDEN.1`), một integration spec mẫu
  `test/integration/query-count-harness.integration-spec.ts` trên list đã đúng (`exchangeRateList`).
- Depends on: none.
- Acceptance: `LD-R3`.
- Verify: `pnpm test:integration` suite mẫu trên PostgreSQL riêng; `pnpm test:discovery`.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, integration suite mẫu xanh; OpenAPI không đổi (`pnpm openapi:export` không diff). Cập nhật
roadmap, ghi registry vào review; Owner review trên revision cụ thể. Sau đó sáu hạng mục capability mỗi hạng mục gỡ đúng
các mục registry của mình.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
