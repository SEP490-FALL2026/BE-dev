# Plan: qd103-request-history-by-role

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W8, 09/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 (Task 1–3, Checkpoint A: quyền đọc + lọc dòng người thụ hưởng + `me` + danh sách theo vai), Phase 2
  (Task 4–5, Checkpoint B: route cờ Super Admin + dòng thời gian + docs). Ước ~35 file. Gói **W8**, lượt 1–2 của đợt.

## Before coding

Đọc `src/modules/requests/README.md` (bảng capability, ai đọc gì), `docs/rules/api-contract.md` (_Collection và detail_, _Handoff_, `F03`),
`docs/rules/module-structure.md` (≤ 25 file/thư mục — `access-request/` đã đủ 25 ⟹ **không** thêm file vào đó, chỉ sửa
`access-request.policy.ts`; R6 không vòng), `scripts/arch/tiers.cjs` (`requests` T5 import được `audit`, `organization`, `identity-access`,
`budgets`). Đối chiếu code ở `bc10bd1c`: `access-request.policy.ts:84-114`, `request-view/access-request-query.service.ts:135-145`,
`timing/request-timing.service.ts:13-25`, `group-line-decisions/group-line-query.service.ts:34-44`, `my-requests/*`,
`personnel/department-member/department-member.controller.ts:27-35` (mẫu mô tả 403), `audit/public/audit.api.ts`. Kiểm W3 đã có cột
`routing_mode`, `one_step_reason`, bảng xác nhận dự phòng, cờ GH-3 (grep `prisma/models/requests.prisma`); thiếu ⟹ dừng và báo.
Lệnh dưới đã kiểm trong `package.json`.

## Design review

- Thiết kế: `ready` — cổng thiết kế W8 (subagent đọc độc lập, 09/11/2026) đã chạy; chat review sửa theo kết quả và quyết định phạm vi (W8).

| Finding | Mức  | Kết luận                                                                                                                                                                           | Sửa ở                        |
| ------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| DA8-02  | Cao  | Đúng — code hiện có cố ý loại Super Admin (`access-request.policy.ts:79-82`); nguồn chỉ cho _xem cờ_ (`US-05-24` _Phạm vi quyền_, AC-4); BRD 5.5.3 Super Admin không có _Tổng chi_ | spec mục 1, 5, 7; Q-124 đổi  |
| DA8-03  | Cao  | Đúng — W3 chỉ ghi audit `ACCESS_REQUEST.NO_NEED_APPROVER` cho nhánh nội bộ một bước; Request trả phí một bước bị chặn sẽ bị gắn oan                                                | spec mục 7; test _DA8-03_    |
| DA8-11  | TB   | Đúng — `US-05-15` _Phạm vi quyền_ và AC-9: mỗi thành viên nhận phần của mình                                                                                                       | spec mục 1–2, 9; Task 1, 4   |
| DA8-13  | TB   | Đúng — gate đọc `NESTED_ARRAYS` + sự kiện registry, không đọc gate-spec                                                                                                            | spec mục 10; Task 3          |
| DA8-21  | Thấp | Đúng — bỏ trỏ tệp ghi chú ngoài repo; gap trỏ `API-GAP-W8.md` của tracker; Sizing mỗi trường một dòng                                                                              | spec đầu, _Sizing decision_  |
| DA8-23  | Thấp | Đúng — thêm ca Super Admin 404, dòng của mình, cờ trả phí                                                                                                                          | spec _Test matrix_           |
| DA8-01  | Cao  | Đúng — hạng mục này thuộc gói W8 sau khi thu hẹp                                                                                                                                   | tracker §5 (chat review ghi) |

## Tasks

### Phase 1 — quyền đọc, `me` mở rộng, danh sách theo vai

### Task 1: migration index + vị từ `canReadRequest`

- Files: `prisma/migrations/<ts>_request_history_indexes/migration.sql`, `prisma/models/requests.prisma` (2 `@@index`),
  `src/modules/requests/access-request/access-request.policy.ts` (+ `access-request.policy.spec.ts` nếu đã có, không thêm file mới vào thư mục),
  `src/modules/requests/request-view/access-request-query.service.ts`, `src/modules/requests/timing/request-timing.service.ts`,
  `src/modules/requests/group-line-decisions/group-line-query.service.ts`; test mới
  `test/integration/requests/request-read-by-role.integration-spec.ts`.
- Depends on: W3 PASS.
- Acceptance: test matrix _chi tiết mở rộng_, _chi tiết phủ định_, _DA8-02 Super Admin chi tiết_ (vế `Get`/`TimingsGet`/`LineList`),
  _DA8-11 dòng của mình_ (vế `LineList`), _ghi không mở_, _migration_; `canReadRequest` trả `onlyLineOf`, `group-line-query.service.ts` lọc dòng;
  không vế `SUPER_ADMIN`; `canViewRequest` cũ còn là alias tới khi hết nơi gọi; Finance: so `spendApproved` với `requestHoldsCommitment` trên dữ
  liệu test (cùng kết quả) rồi mới bỏ lời gọi cũ.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm exec jest src/modules/requests/access-request src/modules/requests/timing`;
  `pnpm test:integration -- test/integration/requests/request-read-by-role.integration-spec.ts test/integration/requests/access-request-review-view.integration-spec.ts test/integration/requests/group-line-closure.integration-spec.ts`.

### Task 2: `meAccessRequestList` — `involvement`, `myLine`

- Files: `src/modules/requests/my-requests/my-requests.dto.ts`, `my-requests.types.ts`, `my-requests.repo.ts` (`whereOf` :110-123 theo
  `beneficiaries.some.employeeId`), `my-requests.mapper.ts`, `my-requests.service.ts`, `my-requests.dto.spec.ts`; test
  `test/http/requests/my-requests.http-spec.ts`, `test/integration/requests/my-requests-read.integration-spec.ts` (thêm ca).
- Depends on: Task 1.
- Acceptance: test matrix _A#55_, _me phủ định_; gọi không `involvement` ⟹ response byte-tương đương trừ 2 trường mới (`involvement: SENT`,
  `myLine: null`).
- Verify: `pnpm exec jest src/modules/requests/my-requests`;
  `pnpm test:http -- test/http/requests/my-requests.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/my-requests-read.integration-spec.ts test/integration/requests/my-requests.integration-spec.ts`.

### Task 3: capability `request-history/` — `departmentAccessRequestList`, `accessRequestList`

- Files: (mới) `src/modules/requests/request-history/request-history.controller.ts`, `request-history.dto.ts`, `request-history.policy.ts`
  (+ `.spec.ts`: phạm vi dòng theo vai, cờ), `request-history.repo.ts`, `request-history.service.ts`, `request-history.types.ts`,
  `request-history.errors.ts`, `request-history.http-errors.ts`; sửa `src/modules/requests/requests.module.ts`,
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, `test/support/api-collection-registry-nested.ts`
  (hoặc `…-nested-first-half.ts` theo thứ tự inventory: mục `flags` của `accessRequestList`, `departmentAccessRequestList`, `bounded`
  `maxItems: 3`, `source` = hằng `REQUEST_HISTORY_FLAGS`), `test/support/api-collection-registry-events.ts` (hai sự kiện `added`,
  `to: 'bounded'`, `bound: 'REQUEST_HISTORY_FLAGS'`); test mới `test/integration/requests/request-history-scope.integration-spec.ts`,
  `test/http/requests/request-history.http-spec.ts`. **Không** sửa `test/gates/api-collection-contract.gate-spec.ts` (DA8-13).
- Depends on: Task 2.
- Acceptance: test matrix _FR-3.7_ (3 dòng), _IT toàn tổ chức_, _SoD-7_, _SoD-3_, _vai không được (danh sách)_ (gồm `SA1`), _projection danh
  sách_, _paging_, _số câu lệnh_ (2 route), _validation_, _gate mảng lồng_; `pnpm arch:capabilities --module requests` không vòng (nếu vướng:
  tách `request-summary/` như spec _Ownership_).
- Verify: `pnpm exec jest src/modules/requests/request-history`;
  `pnpm test:integration -- test/integration/requests/request-history-scope.integration-spec.ts`;
  `pnpm test:http -- test/http/requests/request-history.http-spec.ts test/http/platform/api-inventory.http-spec.ts`;
  `pnpm test:gates`; `pnpm arch:capabilities --module requests`; `pnpm openapi:export`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` —
diff chỉ ở `meAccessRequestList`, 2 route mới; `accessRequestGet`/`TimingsGet`/`LineList` chỉ đổi mô tả quyền). Tự review theo spec mục 1–6, 8, 10–12.
Ghi _Verification_. Commit cục bộ một commit.

### Phase 2 — dòng thời gian, tài liệu

### Task 4: `AuditApi.eventsOfResource`, `lastEventOfResources` + `accessRequestEventList` + `accessRequestAuditFlagList`

- Files: `src/modules/audit/public/audit.api.ts`, `src/modules/audit/audit.repo.ts` (đọc theo `(resource_type, resource_id)`, lọc
  `action IN (...)`, `ORDER BY occurred_at, id`, `select` không lấy `before`; `DISTINCT ON (resource_id)` cho `lastEventOfResources`),
  `src/modules/audit/public/audit.api.spec.ts`; `src/modules/requests/request-history/access-request-events.controller.ts`,
  `request-audit-flags.controller.ts`, `request-events.service.ts`, `request-events.policy.ts` (+ `.spec.ts`: allowlist, rút `reason`, lọc dòng
  theo `onlyLineOf`), `request-history.service.ts`/`.repo.ts` (truy vấn cờ), `request-history.dto.ts`; manifest như Task 3; test mới
  `test/integration/requests/request-events.integration-spec.ts`, `test/integration/requests/request-audit-flags.integration-spec.ts`, thêm ca
  vào `test/http/requests/request-history.http-spec.ts`.
- Depends on: Checkpoint A.
- Acceptance: test matrix _dòng thời gian_ (4 dòng), _DA8-11 dòng của mình_ (vế events), _DA8-02 Super Admin chi tiết_ (vế events),
  _US-05-24 AC-4 route cờ_, _DA8-03 cờ phủ định_, _DA8-03 khớp audit_, _route cờ — không tiền_, _route cờ — vai_, _số câu lệnh_ (events, cờ);
  allowlist đối chiếu tên `action` thật (grep), hành động thiếu ghi ở mục _Lệch_ dưới; actor của `ACCESS_REQUEST.GRANT_COMPLETED` đối chiếu
  (IT Admin hay `SYSTEM`).
- Verify: `pnpm exec jest src/modules/audit src/modules/requests/request-history`;
  `pnpm test:integration -- test/integration/requests/request-events.integration-spec.ts test/integration/requests/request-audit-flags.integration-spec.ts test/integration/audit/audit-query-http.integration-spec.ts`;
  `pnpm test:http -- test/http/requests/request-history.http-spec.ts test/http/audit/audit-events.http-spec.ts`; `pnpm test:gates`.

### Task 5: README + flow MF-1 theo vai

- Files: `src/modules/requests/README.md` (bảng ai đọc gì), `src/modules/audit/README.md`, `test/flows/mf1-request-contract.flow-spec.ts`
  (thêm bước: sau khi cấp xong, `H1`, `C1`, `F1`, `IT1` thấy Request trong danh sách của mình; `SA1` nhận 403 ở `accessRequestList`, 404 ở
  chi tiết; `E3` không thấy).
- Depends on: Task 4.
- Acceptance: test matrix _hồi quy_; flow xanh.
- Verify: `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts`; `pnpm rules:check`;
  `pnpm arch:docs:check`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ thêm `accessRequestEventList`, `accessRequestAuditFlagList`; tự review theo spec mục 2,
7, 9; ghi _Verification_ và danh sách hành động audit ngoài allowlist (nếu có).

## Lệch so với thiết kế

(chat code ghi khi implement)

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
