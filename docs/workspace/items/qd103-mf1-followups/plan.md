# Plan: qd103-mf1-followups

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent số 1 của chat review (W8, 09/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — P1 `continuation` (Task 1–2), P2 nháp (Task 3–4), P3 ứng viên quyền theo vai (Task 5). Ước ~40 file. P1 và P3 làm
  sớm được (spec _Dependencies_). Gói **W8**. Request tiếp tục nhóm (cũ P3a/P3b, Task 5–8 cũ) **không** có ở plan này — gói W8b, xem spec
  _Phụ lục W8b_.

## Before coding

Đọc `src/modules/requests/README.md`, `src/modules/licensing/README.md`, `docs/rules/module-structure.md` (≤ 25 file mỗi thư mục),
`docs/rules/api-contract.md` (`API-LIST-DETAIL.1`, 422 cho validation), `scripts/arch/tiers.cjs` (`personnel` T6 → `licensing`, `requests`;
`licensing` T4 → `identity-access` T2, `catalog` T4). Đối chiếu code ở `bc10bd1c`: `requests/renewal-request/*` (`renewal-request.service.ts:43-73`,
`renewal-request.policy.ts`), `draft/*` (`request-draft.service.ts:43-90` — mẫu lưu `SERVICE_ACCOUNT` dạng `GRANT`), `licensing/my-software/*`,
`personnel/department-member/*`, migration `20261029100500_access_request_draft`. W3/W4 phải PASS đúng hạng mục ghi ở spec; thiếu ⟹ dừng ở
task đó và báo.

## Design review

- Thiết kế: `ready` (P1, P2, P3 của plan này) — cổng thiết kế W8 (09/11/2026) đã chạy; chat review sửa theo kết quả và quyết định phạm vi (W8).

| Finding | Mức  | Kết luận                                                                                                                | Sửa ở                                  |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| DA8-01  | Cao  | Đúng — tracker W8 chỉ giao 2 hạng mục; giữ phần đóng gap trực tiếp của MF-1 (A#42, A#5, A#53)                           | spec _Sizing_, _Explicit out of scope_ |
| DA8-09  | TB   | Đúng — cũ P3a đổi ≈ 40 file gồm `personnel/{offboarding,transfer-review,department-member}`; chuyển sang W8b, chờ Owner | spec _Phụ lục W8b_                     |
| DA8-10  | TB   | Đúng — AC-17 _"ngày kết thúc mới `H1` chọn"_ (EP-05:614) không khớp Q-131 tạm chọn A; thành câu Owner ở W8b             | spec _Phụ lục W8b_                     |
| DA8-13  | TB   | Áp dụng thêm — mảng trong `accessRequestDraftGet.content.body` cần mục `NESTED_ARRAYS` + sự kiện                        | spec _Ownership_; Task 3               |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng; gap trỏ `API-GAP-W8.md` của tracker                                                  | spec                                   |

Kiểm lại (audit, điểm đạt): `RenewalHoldHook.pendingRenewalsOf` trả `Map` (`licensing.extension-points.ts:106`), đủ cho `pendingRequestId`.

## Tasks

### Phase 1 — `continuation` trên danh sách quyền (A#42)

### Task 1: `continuationOf` + đọc theo lô ở licensing

- Files: `src/modules/licensing/expiry/expiry-renewal-window.policy.ts` (+ spec; sẽ có sau `qd103-renewal-request-window`), `expiry-renewal-window.repo.ts`
  (`recordedWindowsOf(pairs)`), `my-software/my-software.repo.ts`, `my-software.service.ts` (+ spec), `my-software.dto.ts`.
- Depends on: W3 `qd103-renewal-request-window` PASS.
- Acceptance: test matrix A#42 `continuation`, `W` đổi, số câu lệnh (`meSoftwareRightList`).
- Verify: `pnpm exec jest src/modules/licensing/expiry src/modules/licensing/my-software`;
  `pnpm test:integration -- test/integration/licensing/my-software-http.integration-spec.ts test/integration/licensing/my-software-continuation.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/my-software.http-spec.ts`.

### Task 2: `departmentMemberSoftwareRightList` mang `continuation`

- Files: `src/modules/licensing/public/licensing.api.ts` (`pageHeldSoftwareOf` trả `continuation`), `public/licensing.types.ts`,
  `src/modules/personnel/department-member/department-member.dto.ts`, `department-member-query.service.ts`.
- Depends on: Task 1.
- Acceptance: test matrix A#42 trưởng phòng; OpenAPI chỉ đổi 2 operation.
- Verify: `pnpm test:integration -- test/integration/personnel/department-member-read.integration-spec.ts`;
  `pnpm test:http -- test/http/personnel/department-members.http-spec.ts`; `pnpm openapi:export`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở `meSoftwareRightList`, `departmentMemberSoftwareRightList`. Ghi _Verification_. Commit
cục bộ một commit.

### Phase 2 — nháp `PROPOSAL`, `RENEWAL`; đọc nháp (A#5)

### Task 3: lưu và đọc nháp hai kind mới

- Files: `src/modules/requests/request-draft/request-draft.policy.ts` (+ spec: `DraftKind`), `request-draft/request-draft.repo.ts` (`planId` null),
  `draft/request-draft.dto.ts` (union 5 nhánh, `draftSchema.planId` nullable, `draftDetailSchema`), `draft/request-draft-content.mapper.ts`,
  `draft/request-draft.service.ts` (+ spec; `save` nhánh `PROPOSAL`/`RENEWAL`, `getOwn`), `draft/request-drafts.controller.ts` (GET `:id`);
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, `test/support/api-collection-registry-nested*.ts`,
  `test/support/api-collection-registry-events.ts` (mảng của `content.body`); test `test/http/requests/request-drafts.http-spec.ts`,
  `test/integration/requests/access-request-draft-constraints.integration-spec.ts`.
- Depends on: W3 `qd103-request-single-step-routing`, `qd103-request-limits-gh` PASS (schema body đề xuất/tiếp tục cuối cùng).
- Acceptance: test matrix A#5 lưu, A#5 đọc, A#5 validation, gate mảng lồng.
- Verify: `pnpm exec jest src/modules/requests/draft src/modules/requests/request-draft`;
  `pnpm test:http -- test/http/requests/request-drafts.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/access-request-draft-constraints.integration-spec.ts`; `pnpm test:gates`.

### Task 4: gửi nháp `PROPOSAL`, `RENEWAL`

- Files: `src/modules/requests/draft/request-draft-submit.service.ts`, `assessment/proposal.service.ts` (`draftId`),
  `renewal-request/renewal-request.service.ts` và `renewal-request-writer.service.ts` (`draftId`: đổi `type` dòng nháp, ghi chi tiết), `access-request/access-request.repo.ts` (đường `draftId` nhận `type`);
  test `test/integration/requests/request-draft-renewal-proposal.integration-spec.ts` (mới); `test/flows/mf1-request-contract.flow-spec.ts` (bước
  nháp tiếp tục khi chưa CC).
- Depends on: Task 3; W3 `qd103-renewal-request-window` PASS.
- Acceptance: test matrix A#5 gửi, AC-14, flow.
- Verify: `pnpm test:integration -- test/integration/requests/request-draft-renewal-proposal.integration-spec.ts test/integration/requests/return-renewal-constraints.integration-spec.ts test/integration/requests/super-admin-cannot-request.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở `accessRequestDraft*`, `accessRequestGet`. Ghi breaking `draft.planId`, `draft.kind` vào
_Verification_. Commit cục bộ một commit.

### Phase 3 — ứng viên quyền theo vai (A#53)

### Task 5: `licenseAssignmentRoleBasedCandidateList`

- Files: `src/modules/identity-access/public/identity-access.api.ts` (+ repo đọc vai có phân trang), `src/modules/catalog/public/catalog.api.ts`
  (`getWorkspaceDutyHoldersOfPlan`), `src/modules/licensing/role-based/role-based-candidates.repo.ts` (mới), `role-based.service.ts`, `role-based.dto.ts`,
  `role-based-assignments.controller.ts` (sẽ có sau `qd103-role-based-access`); manifest coverage/example; test
  `test/integration/licensing/role-based-candidates.integration-spec.ts`, `test/http/licensing/role-based-candidates.http-spec.ts` (mới).
- Depends on: W4 `qd103-role-based-access` PASS (không phụ thuộc Phase 1–2).
- Acceptance: test matrix A#53 (3 dòng).
- Verify: `pnpm exec jest src/modules/licensing/role-based src/modules/identity-access`;
  `pnpm test:integration -- test/integration/licensing/role-based-candidates.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/role-based-candidates.http-spec.ts`; `pnpm arch:check`; `pnpm openapi:export`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5; `pnpm test:gates` (collection contract, module layout, capability graph); README `requests`, `licensing`; ghi
_Verification_. Commit cục bộ một commit.

## Lệch so với thiết kế

(chat code ghi khi implement)

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối; breaking FE (`draft.planId`, `draft.kind`) chuyển cho `qd103-api-docs-regression`.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
