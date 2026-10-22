# Plan: contract đọc của ứng dụng và gói — summary riêng, mảng detail có biên

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

`api-list-detail-contract-remediation` đã có rule, registry và harness. Đối chiếu spec với BE revision lúc bắt đầu; nếu
`g3-catalog-kind-contract-cleanup` chưa merge thì phối hợp một đợt tái sinh client FE cho `/applications`.

## Tasks

### Task 1: summary ứng dụng + `select`

- Files: `application.dto.ts`, `application.repo.ts`, view/service ứng dụng, `application-http.integration-spec.ts`, e2e
  `applications`, `openapi.json` (sinh).
- Depends on: `api-list-detail-contract-remediation`.
- Acceptance: `LD-04`.
- Verify: test harness đỏ trên code cũ (đọc đủ cột, có `domains`), xanh sau; `pnpm check`; e2e; integration.

### Task 2: summary gói

- Files: `plan.dto.ts`, `plan.repo.ts`, `plan-http.integration-spec.ts`.
- Depends on: Task 1 (cùng mẫu).
- Acceptance: `LD-05`.
- Verify: như Task 1.

### Task 3: mảng detail có biên + route con

- Files: `plan-terms.*`, `application-retirement.*`, `application-owner.service.ts`, `application.repo.ts`
  (`similarApplications`), integration tương ứng, `test/support/api-coverage-manifest.ts`.
- Depends on: Task 1.
- Acceptance: `LD-06`.
- Verify: integration với fixture vượt biên; `pnpm openapi:export` review diff.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; diff OpenAPI chỉ các schema đã nêu; gỡ
hai mục registry; ghi chú FE; cập nhật roadmap; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
