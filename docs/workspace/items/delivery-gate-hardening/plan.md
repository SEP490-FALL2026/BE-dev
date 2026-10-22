# Plan: gate giao hàng tin cậy — xuống dòng cố định, suite integration ổn định, drift migration trong CI, sao lưu trước deploy

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review (chặn Task 1: `.gitattributes`). Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc CONTRIBUTING.md, test/README.md, `.github/workflows/ci.yml`, `deploy.yml`, [database và nghiệp vụ](../../../rules/database-business.md).
Ghi bằng chứng lỗi ở [review mục 6](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#6-lệnh-và-kết-quả-trên-cây-cuối).

## Tasks

### Task 1: xuống dòng cố định

- Files: `.gitattributes`, `test/e2e/openapi-export.e2e-spec.ts`, CONTRIBUTING.md (một đoạn renormalize).
- Depends on: Owner đồng ý.
- Acceptance: `GATE-01`.
- Verify: characterization tái hiện artifact CRLF đỏ trước; sau khi thêm đúng một rule
  `openapi.json text eol=lf` và sinh lại riêng artifact, test exact-byte + ca cấm CR xanh; đột biến đổi nội dung thật vẫn đỏ.
  Không chuẩn hóa EOL trong assertion, không `git add --renormalize .`.

### Task 2: ổn định suite integration

- Files: `test/integration/employee-imports-http.integration-spec.ts`, helper liên quan (theo nguyên nhân tìm được).
- Depends on: none.
- Acceptance: `GATE-02`.
- Verify: hai lượt `pnpm test:integration` đầy đủ liên tiếp không timeout; ghi thời gian suite.

### Task 3: CI drift + deploy sao lưu + quy ước migration + annotation ADR

- Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/rules/database-business.md`, ADR-0005, ADR-0013,
  `src/modules/catalog/catalog.module.ts` (chú thích).
- Depends on: none.
- Acceptance: `DB-16`, `DB-05`, `DB-15`, `DB-17`.
- Verify: PR thử có drift làm CI đỏ; `pnpm rules:check`, `pnpm rules:format`; `pnpm check`.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` xanh trên Windows và CI; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
