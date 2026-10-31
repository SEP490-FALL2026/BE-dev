# Plan: chẩn đoán lỗi chạy lại `ops:demo-dataset` (A-04, RA-08)

- [Spec](spec.md); revision đầu vào: Docs không đổi, BE `6eb12d1`.
- Phụ trách: AI theo giao việc Dev A. Thiết kế ban đầu bởi: AI theo giao việc Dev A (31/10/2026).
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` local (31/10/2026, cây làm việc chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`). PR: chưa có. Chưa chạy trên VPS.

## Before coding

Đã đọc DEV-A A-04, README RA-08, [shared-demo-dataset](../shared-demo-dataset/spec.md) (spec/plan/handoff), runbook
[demo-dataset](../../../guides/demo-dataset.md), [operational commands](../../../rules/operational-commands.md),
`src/cli/demo-dataset/**`, `src/modules/installation/**`, `pg-pool.ts`, `transaction-runner.ts`,
`session-advisory-lock.ts`, `database-environment.ts` (`DB_*`), `docker-compose.prod.yml`, `scripts/ops/demo-dataset*.{sh,mjs}`.
Không có log gốc của lần chạy lại lỗi trên VPS trong repo BE/Docs. Môi trường: Docker `postgres:17-alpine` riêng
(`slm-test-a04`, cổng 55435), không `.env`, không VPS.

## Tasks

### Task 1: tái hiện và chẩn đoán trên PostgreSQL cô lập

- Files: không đổi source; script tạm ngoài repo (relay có độ trễ/khựng, chạy lệnh với env thử nghiệm); [evidence](evidence.md).
- Depends on: none.
- Acceptance: tái hiện bằng CLI build thật (`NODE_ENV=production`, runtime role H7 qua `ops:db-roles provision/reconcile`,
  bootstrap bằng `installation-cli.js --password-stdin`, API thật `dist/main.js`): nạp lần đầu, chạy lại lần 2, lần 3;
  với độ trễ 0/100/200 ms và một phản hồi khựng 9 s; đếm câu lệnh từng transaction; xác định nhánh lỗi và phân loại.
- Verify: báo cáo và log relay đã làm sạch ở [evidence](evidence.md#tái-hiện-cli).

### Task 2: transaction theo từng tài khoản demo và nhả khóa không ném

- Files: `src/modules/installation/public/demo-accounts.api.ts`, `public/installation.errors.ts`,
  `src/infrastructure/database/session-advisory-lock.ts`, `test/support/pg-relay.ts` (`delay`),
  `test/integration/installation/demo-dataset-rerun.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: nạp lần đầu + chạy lại hai lần qua RTT 100 ms với ngân sách 10 s: exit 0, 2, 2; mỗi transaction ≤ 40 câu;
  không trùng tài khoản/Audit; 0 khóa; kết nối khóa đứt không che báo cáo.
- Verify: integration đỏ trên mã cũ, xanh trên mã mới (evidence).

### Task 3: mã nguyên nhân trong báo cáo lỗi

- Files: `src/cli/demo-dataset/demo-dataset-failure.ts` (+ spec), `demo-dataset-runner.ts`, `demo-dataset.command.ts`.
- Depends on: none.
- Acceptance: bước `failed` và dòng lỗi cuối kèm `[P2028]`, `[Query read timeout]`, `[ECONNRESET]`…; không URL/giá trị.
- Verify: `pnpm exec jest src/cli/demo-dataset`.

### Task 4: hướng dẫn kiểm chứng và runbook

- Files: [operator-verification](operator-verification.md), [evidence](evidence.md), `docs/guides/demo-dataset.md` (mục 5, 7),
  [shared-demo-dataset spec](../shared-demo-dataset/spec.md) (ranh giới transaction), `docs/roadmap.md`.
- Depends on: Task 2, Task 3.
- Acceptance: operator biết đối chiếu dòng lỗi nào với nhánh nào và bước kiểm chứng kế tiếp; runbook nói đúng hành vi mới.
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Typecheck, lint, unit `src/cli/demo-dataset`, integration ba suite demo-dataset, gates, `pnpm arch:check`, rules; CLI build
thật chạy lại matrix của Task 1 sau sửa; container `slm-test-a04` đã xóa.

## Verification and handoff

Kết quả thực chạy ghi ở [evidence](evidence.md#gate-và-test) (lệnh, môi trường, kết quả).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (VPS: chờ Owner giao quyền).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
