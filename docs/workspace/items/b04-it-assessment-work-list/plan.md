# Plan: b04-it-assessment-work-list — Khám phá công việc IT assessment

- [Spec](spec.md); revision đầu vào: Docs `d6d868c`, BE `6eb12d1`.
- Phụ trách: AI implementer (Dev B `B-04`). Thiết kế ban đầu bởi: AI implementer theo DEV-B/README audit 31/10/2026.
- Owner review: chưa review. Peer review: chưa có. Mọi điểm của `## Scope decision` trong spec là đề xuất mặc định chờ Owner xác nhận.
- Triển khai: `verified` local trên cây làm việc chung, chưa commit. PR: chưa có.

## Before coding

- Đã đọc `docs/rules/api-contract.md`, `module-structure.md`, `database-business.md`, `work-item-sizing.md`, `docs/guides/huong-dan-dev-moi.md`; `DEV-B` B-04 và README audit 31/10 (`RA-05`, `API-GAP-03b`); `US-05-06` (Docs `d6d868c`, `epics/EP-05.md`); spec
  [g5-it-assessment-of-new-software](../g5-it-assessment-of-new-software/spec.md); source `requests/assessment/**` (reader, view,
  gate, step repo, policy, controller), `access-request/assessment-read.repo.ts`, `delegated-request/grant-queue.*` và
  `spend-approval-view/spend-approval-queue.service.ts` (mẫu hàng đợi), `dashboards/it-admin/it-admin-dashboard.service.ts` và
  `organization/department/department-record.service.ts` (`getItAdminScope`, quy ước phạm vi IT Admin).
- Đối chiếu mâu thuẫn trước khi viết mặc định: không có ADR hay spec nào ghi quyết định "không có list" để bác bỏ một danh sách; spec
  assessment chỉ không chứa list (ghi ở `## Behavior and design`, không phải ADR), và README audit nói rõ chưa đủ căn cứ coi queue
  riêng là AC. Không có route list assessment nào đã tồn tại. Nên mặc định được triển khai, không dừng.
- Môi trường: PostgreSQL test Docker `slm-test-db` (127.0.0.1:55432), `TEST_DATABASE_ADMIN_URL` đặt trong shell. Không migration, không
  đụng DB dev.
- Dependency: không. Cây làm việc có 3 hạng mục song song khác (`B-01`, `B-02`, `B-03`) nên `tsc`/gate có thể đỏ do file của họ.

## Tasks

### Task 1: quyết định scope

- Files: `docs/workspace/items/b04-it-assessment-work-list/spec.md` (mục `## Scope decision`).
- Depends on: none.
- Acceptance: tám điểm (list riêng hay queue chung, "đang chờ ai", phạm vi IT Admin, làm thay, việc của chính IT Admin, thiếu giá và
  BM-02 chưa hoàn tất, trạng thái kết thúc, thứ tự/trang) đều có mặc định ghi "đề xuất mặc định — chờ Owner xác nhận", lý do và phương án
  khác; không claim AC, không nói Owner đã duyệt.
- Verify: đọc lại spec; `pnpm rules:check` không báo lỗi riêng của hạng mục này (ngoài đăng ký items index do coordinator).

### Task 2: capability `requests/assessment-queue/`

- Files: `assessment-queue.repo.ts`, `assessment-queue.mapper.ts`, `assessment-queue.mapper.spec.ts`, `assessment-queue.dto.ts`,
  `assessment-queue.service.ts`, `assessment-queue.controller.ts`; một dòng import/controller/provider trong
  `src/modules/requests/requests.module.ts`.
- Depends on: Task 1.
- Acceptance: một operation `GET /api/v1/assessment-queue` (`assessmentQueueList`), vai `IT_ADMIN`, phạm vi `getItAdminScope`, một snapshot
  `RepeatableRead` cho page + count, thứ tự `createdAt, id`, `select` đúng trường của summary, không mảng lồng; mapper dùng lại
  `judgeCompletion`; không đổi route nào của assessment.
- Verify: `pnpm exec jest src/modules/requests/assessment-queue` → 7 test; `pnpm exec eslint src/modules/requests/assessment-queue`; `pnpm arch:check`.

### Task 3: contract HTTP

- Files: `test/http/requests/assessment-queue.http-spec.ts`.
- Depends on: Task 2.
- Acceptance: 401 không token; 403 cho Super Admin, Employee, Finance, tài khoản không vai, Manager và Người duyệt chi (vai suy ra); 422 cho
  `page=0`, `page` không phải số, `pageSize` 101 và 0, query lạ, bộ lọc theo người.
- Verify: `pnpm test:http -- test/http/requests/assessment-queue.http-spec.ts` → 13 test.

### Task 4: integration trên PostgreSQL thật

- Files: `test/integration/requests/assessment-queue.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: theo test matrix của spec: quyền, phạm vi phòng ban, phòng không IT Admin phụ trách, việc chưa tới IT, trạng thái giá/BM-02,
  việc kết thúc (hoàn tất, từ chối ở cổng, rút), stale 409, làm thay và SoD, thứ tự/trang/tie-break theo id của bước, số câu lệnh hằng.
- Verify: `pnpm test:integration -- --runInBand test/integration/requests/assessment-queue.integration-spec.ts` → 19 test; mutation bỏ lọc phòng
  ban của repo → 3 test đỏ.

### Checkpoint

Sau Task 4: eslint, prettier, `pnpm arch:check`, `pnpm test:gates`, http và integration của hạng mục xanh; tự review diff theo spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                    | Revision / môi trường                       | Kết quả thực chạy                                                                                                                  | Giới hạn / việc còn lại          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `pnpm exec jest src/modules/requests/assessment-queue`                                                | `6eb12d1` + diff, Node 24                   | 1 suite, 7 test đạt                                                                                                                | —                                |
| `pnpm exec eslint` trên file của hạng mục, `prettier --write`                                         | như trên                                    | đạt                                                                                                                                | —                                |
| `pnpm arch:check`                                                                                     | như trên                                    | đạt (0 vi phạm)                                                                                                                    | —                                |
| `pnpm test:gates`                                                                                     | như trên                                    | 15/16 suite, 317/318 test đạt; 1 đỏ là `module-graph` do `BudgetsModule.FiscalYearStartLockReader` của hạng mục khác               | không do hạng mục này            |
| `pnpm test:http -- test/http/requests/assessment-queue.http-spec.ts`                                  | như trên                                    | 13 test đạt                                                                                                                        | —                                |
| `pnpm test:integration -- --runInBand test/integration/requests/assessment-queue.integration-spec.ts` | Docker `slm-test-db` PG 17, DB dùng một lần | 19/19 đạt (hai lần chạy liên tiếp sau khi sửa); mutation bỏ lọc `departmentId` → 3 đỏ                                              | không chạy toàn bộ integration   |
| `pnpm test:http -- test/http/platform` (chỉ để đối chiếu)                                             | như trên                                    | đỏ ở inventory/ví dụ/số operation vì operation mới chưa có trong manifest (xem dưới); `GET /api/v1/assessment-queue` là dòng thiếu | coordinator đăng ký rồi chạy lại |

Việc để coordinator (không sửa ở lát này): `test/support/api-coverage-manifest.ts` thêm `'GET /api/v1/assessment-queue'` (cạnh
`GET /api/v1/grant-queue`); `test/support/openapi-example-manifest.ts` thêm `assessmentQueueList: 'ASSESSMENT_QUEUE.LISTED'`; số
operation của `openapi-presentation.http-spec.ts` +1; `pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph`; thẻ module
`src/modules/requests/README.md` thêm `assessment-queue` vào lớp L3 (và số capability); dòng hạng mục ở items index; dòng bảng roadmap
(không cần scope map vì hạng mục là technical enabler không claim Story).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (OpenAPI export, manifest, gate collection đọc `openapi.json`).
- [ ] Giao Owner review trên revision cụ thể; Owner xác nhận hoặc đổi các điểm mặc định; cập nhật roadmap/PR (coordinator).
