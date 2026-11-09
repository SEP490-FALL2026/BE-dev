# Plan: dashboard-request-queues-wiring

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit); plan dùng `D-S26` (mục _Before coding_).
- Phụ trách: chưa phân công (người nhận ghi tên). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Sửa sau audit độc lập 01/11/2026: xem spec `## Changes and acceptance`.

## Before coding

- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy
  `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`, unit test (`pnpm test -- <tệp>`), gate theo tệp
  (`pnpm test:gates -- <tệp>`), HTTP và integration test **theo file đã sửa** (`pnpm test:http -- <tệp>`,
  `pnpm test:integration -- <tệp>`), và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`,
  `pnpm test:e2e` hoặc `pnpm test:integration:timing`. Chạy cả thư mục (ví dụ
  `pnpm test:integration -- test/integration/requests`) là chạy hàng loạt, tính như toàn bộ bộ ⟹ hỏi Owner trước; ngoài ra
  chỉ chạy theo file.
- Thứ tự merge (sóng W4 của lượt `QĐ-93`; merge từng hạng mục một, rebase lên `dev` ngay trước khi merge): merge **sau**
  `qd93-direct-manager-spending-approver-roles` và `qd93-remove-fallback-substitute-approvers` phase A (số đếm phụ thuộc định tuyến
  bước nhu cầu và cách gán vai `MANAGER`). Bắt đầu viết được trước; trước merge chạy lại mọi lệnh theo tệp của Checkpoint trên `dev`
  đã có hai hạng mục đó.
- Migration: không có. Nếu buộc phải thêm: timestamp thật lúc tạo, đổi lại cho lớn hơn migration mới nhất trên `dev` trước
  merge; KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng nên gate
  `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành.
- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `test/README.md`, [module structure](../../../rules/module-structure.md) (R4, R6, R10, ngoại lệ
  capability của `requests`), module card `src/modules/dashboards/README.md`, `src/modules/requests/README.md`.
- Đọc code: `src/modules/dashboards/{employee,manager,section}/*`, `dashboards.module.ts`;
  `src/modules/requests/my-requests/my-requests.repo.ts` (`whereOf`), `my-requests.policy.ts` (`statesOf`),
  `need-decision-queue/need-decision-queue.repo.ts` (`pageOpenOf`, `notOwn`), `access-request/access-request.policy.ts`
  (`mayRequest`), `public/requests.api.ts`, `requests.module.ts`; mẫu facade `licensing/public/licensing-dashboard.api.ts`,
  `personnel/public/personnel-dashboard.api.ts`; test `test/integration/dashboards/dashboards-http.integration-spec.ts`,
  `test/support/dashboard-harness.ts`, `test/http/dashboards/dashboards.http-spec.ts`; gate `test/gates/module-graph.gate-spec.ts`.
- Kiểm `dev` lúc nhận và lúc rebase: khi `qd93-remove-fallback-substitute-approvers` phase A và hạng mục vai đã vào `dev`, harness
  dựng bước nhu cầu và trưởng phòng theo cách mới.

## Tasks

### Task 1: Facade `RequestsDashboardApi` đếm đúng như hai danh sách nguồn

- Files: `src/modules/requests/public/requests-dashboard.api.ts` (mới), `src/modules/requests/my-requests/my-requests.repo.ts`
  (`countOf`), `src/modules/requests/need-decision-queue/need-decision-queue.repo.ts` (`openWhere`, `countOpenOf`),
  `src/modules/requests/requests.module.ts` (provider + export), `test/gates/module-graph.gate-spec.ts` (`PUBLIC_CONTRACT_EXPORTS`),
  `test/integration/requests/requests-dashboard-facts.integration-spec.ts` (mới), `src/modules/requests/README.md`.
- Depends on: none.
- Acceptance: hai dòng _Facade = danh sách_ của test matrix xanh; `pageOpenOf` và `countOpenOf` dùng chung một hàm `where`
  (`pageOf` và `countOf` dùng chung `whereOf`); facade ≤ 8 phụ thuộc, export đúng một lớp; `openRequestsSentBy` dùng đúng
  `mayRequest` của `access-request.policy.ts` (không chép luật) và comment facade nói đây là luật từ chối của danh sách nguồn, không
  phải phân quyền (spec, mục Facade); ca cũ của `b02`/`b03` không sửa.
- Verify: viết integration trước →
  `pnpm test:integration -- test/integration/requests/requests-dashboard-facts.integration-spec.ts` đỏ (facade chưa có) → implement
  → xanh; hồi quy
  `pnpm test:integration -- test/integration/requests/my-requests.integration-spec.ts test/integration/requests/my-requests-read.integration-spec.ts test/integration/requests/need-decision-queue.integration-spec.ts test/integration/requests/need-decision-queue-handover.integration-spec.ts`
  và `pnpm test:http -- test/http/requests/my-requests.http-spec.ts test/http/requests/need-decision-queue.http-spec.ts` xanh, không
  sửa ca cũ;
  `pnpm test:gates -- test/gates/module-graph.gate-spec.ts` xanh; `pnpm arch:check` exit 0.

### Task 2: Hai mục của trang tổng quan đọc số đếm thật

- Files: `src/modules/dashboards/dashboards.module.ts` (import `RequestsModule`),
  `src/modules/dashboards/employee/employee-dashboard.service.ts` và spec cạnh nó,
  `src/modules/dashboards/manager/manager-dashboard.service.ts` và spec cạnh nó,
  `src/modules/dashboards/section/dashboard-section.policy.ts` và spec cạnh nó (bỏ `REQUEST_QUEUE_NOT_DELIVERED`),
  `test/integration/dashboards/dashboards-http.integration-spec.ts`,
  `test/support/dashboard-harness.ts` (dựng yêu cầu và bước nhu cầu nếu cần), `test/http/dashboards/dashboards.http-spec.ts`,
  `src/modules/dashboards/README.md`, `openapi.json` (sinh), `docs/generated/module-graph.md` (sinh).
- Depends on: Task 1.
- Acceptance: các dòng `API-DOC-F06` Employee, `API-DOC-F06` trưởng phòng, _Super Admin_, _Lý do thiếu nguồn_, _Quyền không đổi_,
  _Ranh giới module_, _OpenAPI_ của test matrix xanh; ca integration cũ "still no number for the requests" đổi thành ca so số với
  `meAccessRequestList?view=open`; module card nêu hai mục `COUNTED` và phụ thuộc `requests`.
- Verify: sửa unit và integration trước →
  `pnpm test -- src/modules/dashboards` và
  `pnpm test:integration -- test/integration/dashboards/dashboards-http.integration-spec.ts` đỏ → implement → xanh;
  `pnpm openapi:export` rồi `pnpm test:http -- test/http/dashboards test/http/platform/openapi-export.http-spec.ts test/http/platform/api-inventory.http-spec.ts`
  xanh; `pnpm arch:graph` rồi `pnpm arch:docs:check` exit 0.

### Checkpoint

Sau Task 2: `pnpm check` exit 0;
`pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts test/http/requests/my-requests.http-spec.ts test/http/requests/need-decision-queue.http-spec.ts test/http/platform/openapi-export.http-spec.ts test/http/platform/api-inventory.http-spec.ts`
xanh;
`pnpm test:integration -- test/integration/dashboards/dashboards-http.integration-spec.ts test/integration/requests/requests-dashboard-facts.integration-spec.ts test/integration/requests/my-requests.integration-spec.ts test/integration/requests/my-requests-read.integration-spec.ts test/integration/requests/need-decision-queue.integration-spec.ts test/integration/requests/need-decision-queue-handover.integration-spec.ts`
xanh (theo file, `D-S26`; chạy toàn bộ chỉ sau khi hỏi Owner); `pnpm openapi:export` không diff; tự review diff theo spec (một câu
`count` thêm mỗi trang, không cạnh ngược tầng); báo chủ hai hạng mục `a10-*` cập nhật bảng phân rã. Lặp lại các lệnh này sau khi
rebase lên `dev` có hạng mục vai và fallback phase A.

## Verification and handoff

| Lệnh / kiểm tra AC                                | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại               |
| ------------------------------------------------- | --------------------- | ----------------- | ------------------------------------- |
| `pnpm check`                                      | —                     | chưa chạy         | —                                     |
| `pnpm test:http -- <tệp của Checkpoint>`          | —                     | chưa chạy         | —                                     |
| `pnpm test:integration -- <tệp của Checkpoint>`   | —                     | chưa chạy         | PostgreSQL 17 riêng; sau rebase W4    |
| `pnpm test:integration` toàn bộ / `pnpm test:e2e` | —                     | không cần         | chỉ sau khi hỏi Owner (`D-S26`)       |
| `pnpm openapi:export` (không diff sau commit)     | —                     | chưa chạy         | báo FE: enum `reason` bớt một giá trị |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối, gồm hai quyết định kỹ thuật Owner duyệt 01/11/2026.
- [ ] Diff cuối đã tự review; module card `dashboards`, `requests` đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện
      thật.
