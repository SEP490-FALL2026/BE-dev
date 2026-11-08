# Plan: qd103-request-limits-gh

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101` + commit bốn hạng mục W3 trước + commit W2.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** (~40 file) — Phase 1 (Task 1–3, Checkpoint 1), Phase 2 (Task 4–5, Checkpoint 2).

## Before coding

Đọc README `requests` (thứ tự khóa; `access-request/`, `group-request/` đã đủ 25 file — capability mới `request-limits/` không
thêm file vào hai thư mục đó), `docs/rules/module-structure.md` (phần capability khác gọi là capability; hậu tố từ vựng; raw SQL chỉ
`*.repo.ts`), README `operating-parameters` (`owner` của W2), README `licensing`. Đối chiếu: `request-intake/access-request.service.ts:72-116`
(`submitWithin`), `request-intake/request-sender.service.ts:25-35`, `access-request/request-facts.service.ts:102-106,209-214`,
`access-request/access-request.types.ts:243-256` (`NOT_OPEN_FOR_LEAVER`), `access-request/open-request/open-request.repo.ts:9,40-43`
(`OPEN_LINE_STATES`), `group-request/group-request.policy.ts:40-125`, `group-request-submission/group-submission-facts.service.ts:100-166`,
`group-request-submission/group-requests.controller.ts:158` (ứng viên), `assessment/proposal.service.ts`, `draft/request-draft-submit.service.ts`,
`renewal-request/renewal-request.service.ts:90-131` (`redirect`), `licensing/public/licensing.api.ts:59-86`,
`operating-parameters/parameter-definitions.policy.ts:76-110`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 0 Cao, 3 Trung bình, 2 Thấp ⟹ đã sửa (DA3-07 `access-request/limits/` →
capability `request-limits/`, khóa tư vấn vào `request-limits.repo.ts`, `arch:capabilities` ở Checkpoint 1; DA3-13 thêm
`renewal-request.service.ts`/`renewal-request.dto.ts`, lý do GH-3 khi gửi muộn; DA3-14 `HEAD_IN_GROUP` + gỡ nhánh `own` chuyển sang
single-step Task 3, ở đây chỉ còn ứng viên; DA3-17 dòng test AC-10 + ngoại lệ; DA3-18 dùng `NOT_OPEN_FOR_LEAVER`/`OPEN_LINE_STATES`);
không sửa: không có.

## Tasks

### Phase 1 — schema, luật GH, gửi cá nhân

### Task 1: migration cờ GH-3 và ngoại lệ

- Files: `prisma/models/requests.prisma`, `prisma/migrations/<ts>_request_limits_gh/migration.sql`,
  `test/integration/requests/access-request-constraints.integration-spec.ts` (CHECK cờ ⇔ lý do, ngoại lệ lạ bị từ chối).
- Depends on: none (trong hạng mục).
- Acceptance: DB đúng _Ownership_.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/requests/access-request-constraints.integration-spec.ts`.

### Task 2: tham số, hàm đọc phần mềm trả phí, capability `request-limits`

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec), `licensing/public/licensing.api.ts` + repo/service đọc
  quyền cá nhân (một truy vấn cho nhiều người), capability mới: `requests/request-limits/request-limits.policy.ts` + `request-limits.policy.spec.ts`,
  `requests/request-limits/request-limits.repo.ts` (đếm + `pg_advisory_xact_lock`), `requests/request-limits/request-limits.service.ts`,
  `requests/access-request/group-request.types.ts` (nhận `OPEN_LINE_STATES`), `requests/access-request/open-request/open-request.repo.ts`
  (import hằng), `requests/access-request/request-facts.service.ts` (`settings()` thêm `gh2Max`, `gh3Threshold`), `requests/requests.module.ts`.
- Depends on: Task 1.
- Acceptance: test matrix AC-1/AC-8/AC-10/Q-32/QĐ-103t(2) ở unit; truy vấn đếm (AC-9, Q-28) ở integration.
- Verify: `pnpm exec jest src/modules/requests/request-limits src/modules/operating-parameters src/modules/licensing`;
  `pnpm test:integration -- test/integration/requests/request-limits.integration-spec.ts` (mới, phần đếm).

### Task 3: áp GH cho gửi cá nhân, đề xuất, bản nháp, xem trước, gửi muộn Request tiếp tục; cờ trên view

- Files: `request-intake/access-request.service.ts`, `request-intake/access-request-submission.mapper.ts`,
  `access-request/access-request.dto.ts` (body `manyPaidSoftwareReason`, `flags`), `access-request/access-request.errors.ts`,
  `access-request/access-request.http-errors.ts` (3 mã mới + ví dụ), `assessment/proposal.service.ts`, `assessment/assessment.dto.ts`,
  `draft/request-draft-submit.service.ts`, `request-submission/request-preview.service.ts`, `request-submission/request-preview.dto.ts`,
  `renewal-request/renewal-request.service.ts` (`redirect` truyền lý do), `renewal-request/renewal-request.dto.ts`
  (`manyPaidSoftwareReason?`), `request-view/*`, `need-decision-queue/need-decision-queue.dto.ts` + mapper,
  `spend-approval-view/spend-approval.dto.ts` + mapper, `my-requests/my-requests.dto.ts`; test
  `test/integration/requests/request-limits.integration-spec.ts`, `test/http/requests/request-limits.http-spec.ts` (mới),
  `test/integration/requests/access-request-preview.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix AC-1→AC-4, AC-6, AC-7, AC-9, Q-28, concurrency (cá nhân), gửi muộn Request tiếp tục (3 ca).
- Verify: `pnpm exec jest src/modules/requests/request-intake src/modules/requests/request-submission src/modules/requests/renewal-request src/modules/requests/spend-approval-view src/modules/requests/need-decision-queue`;
  `pnpm test:http -- test/http/requests/request-limits.http-spec.ts test/http/requests/need-decision-queue.http-spec.ts test/http/requests/my-requests.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/request-limits.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/requests/access-request-new-software.integration-spec.ts test/integration/licensing/renewal-request.integration-spec.ts`.

### Checkpoint 1 (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `pnpm arch:check`; `pnpm arch:capabilities --module requests` (`request-limits` L1, không vòng, chỉ
import lõi); `pnpm test:gates` (hậu tố từ vựng, raw SQL chỉ ở repo); `openapi:export` (trường + lỗi mới). Tự review spec mục 1–4, 7, 8.

### Phase 2 — Request nhóm, flow, seed

### Task 4: Request nhóm — GH từng dòng, lý do GH-3 chung, ứng viên không có trưởng phòng

- Files: `group-request/group-request.policy.ts` (+ spec; `LineReason` + `OPEN_LIMIT_REACHED`), `group-request/group-request.dto.ts`,
  `group-request/group-request.http-errors.ts`, `group-request-submission/group-submission-facts.service.ts`,
  `group-request-submission/group-request.service.ts`, `group-request-submission/group-request-writer.service.ts`,
  `group-request-submission/group-requests.controller.ts` (ví dụ lỗi, ứng viên `groupRequestCandidateList`); test
  `test/integration/requests/group-request-submit.integration-spec.ts`, `group-request-constraints.integration-spec.ts`,
  `group-request-edge.integration-spec.ts`, `group-request-too-few-lines.integration-spec.ts`.
- Depends on: Checkpoint 1.
- Acceptance: test matrix AC-11, L2-06 (ứng viên), Q-30, nhóm của trưởng phòng, concurrency (nhóm chéo).
- Verify: `pnpm exec jest src/modules/requests/group-request src/modules/requests/group-request-submission`;
  `pnpm test:integration -- test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/group-request-constraints.integration-spec.ts test/integration/requests/group-request-edge.integration-spec.ts test/integration/requests/group-request-too-few-lines.integration-spec.ts test/integration/requests/request-limits.integration-spec.ts`.

### Task 5: flow, e2e, seed

- Files: `test/flows/mf1-group-request.flow-spec.ts`, `test/flows/mf1-request-contract.flow-spec.ts` (thêm ca GH-2 qua API thật);
  seed: chỉ chạy kiểm (spec mục 9), sửa fixture tối thiểu nếu vỡ.
- Depends on: Task 4.
- Acceptance: flow MF-1 xanh; `ops:seed` xanh và chạy lại không đổi.
- Verify: `pnpm test:flows -- test/flows/mf1-group-request.flow-spec.ts test/flows/mf1-request-contract.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`;
  `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Checkpoint 2 (hết lượt 2)

Kiểm tra nhanh tracker §4.5; README `requests` (capability `request-limits`, khóa tư vấn trong thứ tự khóa, bảng tầng do lệnh tính),
`licensing`, `operating-parameters`. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
