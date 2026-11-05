# Plan: qd96-100-subscription-owner-confirmation

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f` (+ thay đổi 05/11 chưa commit), BE `808318a4`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent V2-MF2-MF3-MF5).
- Owner review: chưa review. Peer review: tùy chọn (khuyến nghị cho phần quyền đọc).
- Triển khai: `verified` (local, chưa commit, nhánh `feat/qd96-100-alignment`, 05/11/2026 tối; chỉ Phần A, Task 1–4; Phần B chưa làm). PR: chưa có. Cỡ: Phần A ≈ 8h, Phần B ≈ 8h. **Mức FE-tonight: Phần A = A.**

## Before coding

Đọc `AGENTS.md`, `docs/rules/{api-contract,database-business,module-structure}.md`, `licensing/README.md`, toàn bộ
`src/modules/licensing/subscription-renewal/**` (không phải spec), migration `20261101000200_licensing_subscription_renewals`,
`catalog/public/subscription-period.api.ts`, test `test/http/licensing/subscription-renewal*`, `test/integration/licensing/subscription-renewal*`.
Đối chiếu `file:dòng` của spec với cây hiện tại. Quick set: `pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check`
cộng test theo file; HTTP đổi thêm `pnpm test:http -- <file>` và `pnpm openapi:export`.

## Tasks

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 1–4 (toàn bộ Phần A). Task 5–6 = B.

| Task | Operation                                                          | Request sau                                                                                         | Response sau                                                                                                                                        | Test 422 field bỏ                                                           |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | (migration) CHECK `decider_role` thêm `OWNER_DEPARTMENT_HEAD`      | —                                                                                                   | —                                                                                                                                                   | integration                                                                 |
| 2    | `subscriptionRenewalPropose` (IT)                                  | `{subscriptionId, choice, proposedQuantity?, note?, businessOwnerOpinion?, releasedAssignmentIds?}` | detail `proposal.releasedSeatCount`; `waitingReason: 'NO_HEAD' \| null`                                                                             | `withinCurrentTerm` (1 test)                                                |
| 3    | `subscriptionRenewalDecide` (trưởng phòng phòng sở hữu ngày quyết) | `{decision: 'CONFIRM', reason?, acknowledgeActiveUsers?}`                                           | `decision.deciderRole = OWNER_DEPARTMENT_HEAD`; 403 `NOT_DECIDER`; 409 `PROPOSAL_STALE`, `ACTIVE_USERS_NOT_ACKNOWLEDGED`, `NOT_AWAITING_DECISION`   | `choice`, `quantity`, `withinCurrentTerm`, `releasedAssignmentIds` (4 test) |
| 3    | `subscriptionRenewalRecordOutcome` (IT)                            | `note` bắt buộc khi `outcome ∈ {VENDOR_REFUSED, DIFFERENT}`                                         | —                                                                                                                                                   | thiếu `note` với 2 kết quả (2 test)                                         |
| 4    | `subscriptionRenewalList`, `subscriptionRenewalGet`                | —                                                                                                   | IT, Finance (chỉ đọc) mọi hồ sơ; trưởng phòng hôm nay: chỉ phòng mình (khác ⟹ 404, không làm trưởng phòng ⟹ 403); `decision.snapshot = null` với IT | —                                                                           |
| 4    | `subscriptionRenewalSeatRanking` (IT, trưởng phòng sở hữu)         | query `proposedOnly?`                                                                               | item `{assignmentId, employee {id, employeeCode, fullName}, group, position, validFrom, lastActivityOn, inProposal}`                                | —                                                                           |

### Task 1: migration + Prisma

- Files: `prisma/migrations/<ts>_licensing_renewal_owner_confirmation/migration.sql`, `prisma/models/licensing.prisma`,
  `test/integration/licensing/subscription-renewal-constraints.integration-spec.ts` (mới hoặc file constraints hiện có).
- Depends on: none (timestamp lúc merge, sau migration cuối trên branch).
- Acceptance: CHECK `decider_role` ba giá trị (không cột mới, không viết lại guard — D1); dòng _Migration_ của test matrix.
- Verify: migrate DB riêng, drift sạch; integration constraints.

### Task 2: đề xuất mang seat thu hồi (không nhận `withinCurrentTerm`); thông báo trưởng phòng sở hữu

- Files: `subscription-renewal.dto.ts`, `proposal/renewal-proposal.{service,policy}.ts` (+ spec), `subscription-renewal.repo.ts`
  (`insert` + released), `subscription-renewal-parties.service.ts` (`ownerHeadOf`), `subscription-renewal-notifier.service.ts` (`NO_HEAD`).
- Depends on: Task 1.
- Acceptance: dòng QT 5.7, L-602 (vế đề xuất).
- Verify: unit policy; HTTP propose.

### Task 3: xác nhận của trưởng phòng sở hữu; bỏ chặn Cost Center; gỡ listener

- Files: `decision/renewal-decision.{service,policy}.ts` (+ spec), `decision/renewal-decision-trail.service.ts` (Finance),
  `subscription-renewal.types.ts` (`OWNER_DEPARTMENT_HEAD`), `subscription-renewal.dto.ts` (`recordOutcomeBodySchema`: `note` bắt buộc — D9 A), `subscription-renewal.errors.ts` + `.http-errors.ts` (`PROPOSAL_STALE`),
  `subscription-renewals.controller.ts` (OpenAPI), xóa `spending-approver-wait.listener{,.spec}.ts`, `licensing.module.ts`, registry extension-wiring.
- Depends on: Task 2.
- Acceptance: dòng F26, `QĐ-94d`(2), cũ dữ liệu, `CANCEL`, Đồng thời.
- Verify: unit; integration decide; HTTP decide; `pnpm arch:check`.

### Task 4: phạm vi đọc + seat ranking + snapshot

- Files: `subscription-renewal-view.service.ts`, `subscription-renewal.mapper.ts`, `subscription-renewal.repo.ts` (`page` lọc `subscriptionIds`),
  `subscription-renewal-parties.service.ts` (`canRead` theo vai + phòng), `catalog/public/subscription-period.api.ts`
  (`listSubscriptionIdsOwnedBy`) + repo catalog, `licensing/README.md`.
- Depends on: Task 3.
- Acceptance: dòng Đọc, L-617; số câu lệnh hằng mỗi trang.
- Verify: HTTP list/get/seat-ranking theo 4 vai; `pnpm openapi:export`.

### Checkpoint (hết Phần A)

Quick set + `test:http` các file chạm + `openapi:export` xanh; tự review diff theo test matrix; báo FE contract (bảng Ownership của spec).

### Task 5 (Phần B): `REQUEST_CHANGES` + IT đề xuất lại

- Files: `prisma/migrations/<ts>_licensing_renewal_changes_requested_value/` (`ADD VALUE`, DB-05), `prisma/migrations/<ts+1>_licensing_renewal_changes_requested/`
  (CHECK `decision_whole`, partial unique, guard), `subscription-renewal.{dto,types,repo}.ts`, `decision/renewal-decision.service.ts`, sweep/alerts đọc hồ sơ sống.
- Depends on: Task 4.
- Acceptance: `US-11-06` AC-5, `US-11-05` AC-14; đổi contract cộng thêm (`decision` thêm `REQUEST_CHANGES`).
- Verify: integration constraints + decide; HTTP decide/propose lại; `pnpm openapi:export`.

### Task 6 (Phần B): nhắc khi có trưởng phòng, đọc sự kiện hạn chót, cảnh báo Finance

- Files: listener `OrganizationChangeListeners` mới trong `subscription-renewal/`, `subscription-renewals.controller.ts` (`subscriptionDeadlineEventList` thêm vai), `decision/renewal-decision-trail.service.ts`.
- Depends on: Task 5.
- Acceptance: `US-11-06` AC-10 vế Finance, AC-11 vế nhắc; L-614 vế đọc.
- Verify: integration listener; HTTP deadline events theo vai.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                  | Revision / môi trường                                     | Kết quả thực chạy                                                                                         | Giới hạn / việc còn lại        |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `pnpm typecheck`                                                                                                    | cây làm việc chưa commit, nhánh `feat/qd96-100-alignment` | `tsc --noEmit` thoát 0                                                                                    | —                              |
| `eslint` `src/modules/licensing`, `test/integration/licensing`, `test/http/licensing`, `test/support`, `test/gates` | như trên                                                  | sạch với file hạng mục; 1 lỗi `unbound-method` ở `test/support/devices-harness.ts` (chat G7)              | `pnpm lint` toàn repo do Owner |
| `pnpm test -- src/modules/licensing/subscription-renewal`                                                           | như trên                                                  | 39/39 xanh                                                                                                | —                              |
| `pnpm test:http -- test/http/licensing/subscription-renewals.http-spec.ts`                                          | như trên                                                  | 45/45 xanh                                                                                                | —                              |
| `pnpm test:integration -- …/subscription-renewal-decision…` (PostgreSQL 17 local `slm-test-db`)                     | như trên                                                  | 16/16 xanh                                                                                                | —                              |
| `pnpm test:integration -- …/subscription-renewal-owner-confirmation…`                                               | như trên                                                  | 3/3 xanh (CHECK `decider_role`, `note` D9, số câu lệnh hằng)                                              | —                              |
| `pnpm test:integration -- …/subscription-renewal-outcome… …/subscription-renewal-sweep…`                            | như trên                                                  | outcome 100 % xanh; sweep xanh sau khi thêm `note` vào ca `VENDOR_REFUSED` (D9)                           | —                              |
| `pnpm test:http -- test/http/platform test/http/licensing`                                                          | như trên                                                  | 21 file, 411 test xanh                                                                                    | —                              |
| `pnpm test:gates`                                                                                                   | như trên                                                  | 16/16 file, 329 test xanh (`extension-wiring` sau khi gỡ listener)                                        | —                              |
| `pnpm arch:check`                                                                                                   | như trên                                                  | không vi phạm                                                                                             | —                              |
| `pnpm openapi:export` (ra thư mục tạm)                                                                              | như trên                                                  | không khác `openapi.json` hiện có một byte                                                                | —                              |
| `pnpm rules:check`                                                                                                  | như trên                                                  | 1 lỗi ở `docs/workspace/items/g7-device-registry-acknowledgement/plan.md` (chat G7), không thuộc hạng mục | —                              |
| full suite, `pnpm check`, `test:http` toàn bộ                                                                       | chưa chạy                                                 | —                                                                                                         | do Owner lúc audit             |

- [x] Phần A có bằng chứng; Phần B ghi rõ chưa làm (Task 5, 6).
- [x] README/spec khớp; `Docs/Figma UI-UX/API-Integration` chưa cập nhật trong lượt này (bảng contract nằm ở báo cáo bàn giao).
- [ ] Giao Owner review trên revision cụ thể.

06/11/2026 (FIX-DOT-1 Chat 4, A-H1/A-H2/A-M1/A-M2): `verified` local. `pnpm test:integration -- test/integration/licensing/subscription-renewal` 4 file 36 test xanh; `pnpm test -- src/modules/licensing/subscription-renewal` 42 test xanh; `pnpm test:gates` 330/330; `pnpm test:http -- openapi` 69 xanh; `pnpm openapi:export` đã chạy.
