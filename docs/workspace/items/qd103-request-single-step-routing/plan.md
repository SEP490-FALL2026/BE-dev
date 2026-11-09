# Plan: qd103-request-single-step-routing

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `1cd81101` + commit ba hạng mục W3 trước + commit W2 (`organization`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W3, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **bốn lượt** (hạng mục > 40 file, 7 task) — Phase 1 (Task 1–2), Phase 2 (Task 3–4), Phase 3 (Task 5), Phase 4
  (Task 6–7); mỗi lượt dừng ở checkpoint của nó. Giữa Phase 1 và Phase 3, dữ liệu do migration B đánh dấu chưa được hoàn tất —
  chấp nhận được vì không deploy giữa chừng hạng mục.

## Before coding

Đọc README `requests` (bất biến định tuyến dòng 1/2/4/5/8/9, thứ tự khóa, ngoại lệ gate `capability-graph`, 25 file/thư mục:
`access-request/`, `group-request/` đầy — **không thêm file** vào hai thư mục này; không tạo nhóm con trong `access-request/` vì nhóm
chỉ capability chủ dùng được, `docs/rules/module-structure.md:56-66`), `docs/rules/database-business.md`. Đối chiếu:
`access-request/routing.policy.ts:47-61`, `access-request/access-request.policy.ts:80-114`, `request-intake/access-request.service.ts:72-116`,
`request-intake/access-request-submission.mapper.ts:18-55`, `spend/spend-entry.service.ts:19-25`, `spend/spend-submission.policy.ts:13-22`,
`spend/spend-routing.service.ts:242-273`, `step-routing/reassignment.policy.ts:101-120`, `step-routing/step-target.service.ts:60-100`,
`reassignment/organization-change.listener.ts:38-90`, `public/step-redetermination-sweep.api.ts` (mỗi Request một transaction),
`group-request-submission/group-need-routing.policy.ts:60-105`, `group-request-submission/group-submission-facts.service.ts:100-166`,
`group-request/group-request.dto.ts:104-108`, `access-request/access-request.types.ts:243-256`, `assessment/assessment.dto.ts:92-103`.
Mẫu migration enum hai bước: `prisma/migrations/20261108300000_licensing_renewal_stale_state` + `20261108300100_licensing_renewal_stale_rules`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: 0 Cao, 8 Trung bình, 1 Thấp ⟹ đã sửa (DA3-07 phần của hạng mục: bỏ gợi ý nhóm
`access-request/routing/`; DA3-08 kế nhiệm đã ghi áp lúc gửi; DA3-09 Request nội bộ không chuyển ⟹ Q-33; DA3-10 `accessRequestLineList`;
DA3-11 test trạng thái mới ở hủy khi nghỉ, điều chuyển, ngừng phòng/Cost Center, dashboard; DA3-14 `HEAD_IN_GROUP` + gỡ nhánh `own`
về Task 3; DA3-15 Q-24 đánh dấu + lượt hoàn tất, ma trận ca migration, cột thắng `policy.chain` v1; DA3-16 chuyển hai pha, sau
commit W2; DA3-19 `P-NEW` → `OPS`) và Q-24 (cải tiến), Q-31 (điều kiện); không sửa: không có.

## Tasks

### Phase 1 — schema, bảng định tuyến, gửi cá nhân

### Task 1: migration A (giá trị enum) và migration B (cột định tuyến, drop cờ cùng người, đánh dấu dữ liệu Q-24)

- Files: `prisma/models/requests.prisma`, `prisma/migrations/<ts>_request_one_step_values/migration.sql`,
  `prisma/migrations/<ts+1>_request_one_step/migration.sql`, `test/integration/requests/one-step-routing-migration.integration-spec.ts`
  (mới, dùng `test/support/migration-history.ts`), `test/integration/requests/access-request-constraints.integration-spec.ts`.
- Depends on: none (trong hạng mục).
- Acceptance: test matrix Q-24/DA3-15 phần đánh dấu (state giữ); CHECK từ chối `ONE_STEP` không lý do và `VIA_HEAD` có lý do.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/requests/one-step-routing-migration.integration-spec.ts test/integration/requests/access-request-constraints.integration-spec.ts`.

### Task 2: bảng định tuyến mới (có kế nhiệm đã ghi); gửi Request một bước (cá nhân, tiếp tục, đề xuất, tài khoản dịch vụ, bản nháp)

- Files: `access-request/routing.policy.ts` (+ spec), `access-request/access-request.policy.ts` (+ spec, v2),
  `access-request/routing-facts.service.ts`, `access-request/request-facts.service.ts`, `access-request/access-request.repo.ts`,
  `access-request/access-request.types.ts`, `organization/public/organization-read.api.ts` (`nextHeadPeriodOf`) + repo/service đọc
  của `organization`, `request-intake/access-request.service.ts`, `request-intake/access-request-submission.mapper.ts` (+ spec),
  `renewal-request/renewal-request-writer.service.ts`, `renewal-request/renewal-request-submission.mapper.ts`,
  `service-account-request/service-account-request.service.ts`, `assessment/proposal.service.ts`, `spend/spend-routing.service.ts`
  (gỡ `samePerson`; nhánh `PRICE_MISSING` không ghi kiểm tra), `spend/spend-step.repo.ts` (gỡ `flagSamePerson`),
  `test/integration/requests/one-step-request.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix R-A07 (unit, 6 ca), US-06-17 AC-1/AC-2/AC-3/AC-4/AC-7, US-05-24, US-05-03 AC-13, tiếp tục, phần mềm mới
  (phần gửi), Q-31 (3 ca; ca gửi lại chạy ở Task 4).
- Verify: `pnpm exec jest src/modules/requests/access-request src/modules/requests/request-intake src/modules/requests/spend src/modules/organization`;
  `pnpm test:integration -- test/integration/requests/one-step-request.integration-spec.ts test/integration/requests/access-request-internal-path.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts test/integration/requests/spend-routing.integration-spec.ts test/integration/licensing/renewal-request.integration-spec.ts`.

### Checkpoint 1 (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `pnpm arch:check`; `pnpm arch:capabilities --module requests`. Tự review spec mục 1, 3, 4.

### Phase 2 — nhóm, quyết một bước, gửi lại

### Task 3: Request nhóm một bước, `HEAD_IN_GROUP`; gỡ nhánh `own`, `entryFor`; thẩm định xong ⟹ kiểm

- Files: `group-request-submission/group-need-routing.policy.ts` (+ spec; gỡ nhánh `own`), `group-request-submission/group-submission-facts.service.ts`
  (gỡ `isHeadOwnLine`), `group-request/group-request.policy.ts` (+ spec; `LineReason` + `HEAD_IN_GROUP`), `group-request/group-request.dto.ts`,
  `group-request/group-request.http-errors.ts`, `group-request-submission/group-request-writer.service.ts`,
  `group-request-submission/group-request.service.ts`, `spend/spend-entry.service.ts` (xóa), `spend/spend-submission.policy.ts` (+ spec,
  bỏ `entryFor`), `need-decision/*effects*` (gỡ gọi `SpendEntryService`), `assessment/assessment-completion.service.ts`, `requests.module.ts`;
  test `test/integration/requests/group-request-submit.integration-spec.ts`, `group-request-need-decision.integration-spec.ts`,
  `spend-need-decision.integration-spec.ts`, `access-request-new-software.integration-spec.ts`, `group-request-constraints.integration-spec.ts`.
- Depends on: Checkpoint 1.
- Acceptance: test matrix R-A07 (nhóm), L2-06 (2 ca), phần mềm mới (thẩm định xong), AC-8.
- Verify: `pnpm exec jest src/modules/requests/group-request src/modules/requests/group-request-submission src/modules/requests/spend src/modules/requests/assessment`;
  `pnpm test:integration -- test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/group-request-need-decision.integration-spec.ts test/integration/requests/spend-need-decision.integration-spec.ts test/integration/requests/access-request-new-software.integration-spec.ts test/integration/requests/group-request-constraints.integration-spec.ts`.

### Task 4: quyết một bước, trả về người yêu cầu, sửa và gửi lại (`accessRequestResubmit`), rút

- Files: `spend/spend-decision.policy.ts` (+ spec: nhánh `ONE_STEP`), `spend-approval/spend-decision.service.ts`,
  `spend-approval/spend-batch-decision.service.ts`, `group-line-decisions/group-spend-decision.service.ts`, `spend/spend.errors.ts`,
  `spend/spend.http-errors.ts` (`RECHECKED_RETURNED_TO_REQUESTER`), `request-submission/access-requests.controller.ts` (route mới — giữ
  thứ tự controller), `request-intake/request-resubmission.service.ts` (mới), `access-request/access-request.errors.ts`,
  `access-request/access-request.http-errors.ts` (`NOT_AWAITING_REVISION`, dùng lại `NOT_REQUESTER`), `access-request/withdrawal.policy.ts`
  (+ spec), `spend-submission/supplement.service.ts`, `spend-submission/supplement-recorder.service.ts` (actor người yêu cầu),
  `spend-submission/spend-queue.service.ts` (loại `ONE_STEP`), `test/support/api-coverage-manifest.ts`,
  `test/http/requests/one-step-resubmission.http-spec.ts` (mới).
- Depends on: Task 3.
- Acceptance: test matrix AC-5/AC-11, gửi lại (3 ca), Q-31 (gửi lại khi giá vẫn thiếu), rút/AC-6/AC-9, AC-19.
- Verify: `pnpm exec jest src/modules/requests/spend src/modules/requests/spend-approval src/modules/requests/request-intake src/modules/requests/access-request/withdrawal.policy.spec.ts`;
  `pnpm test:http -- test/http/requests/one-step-resubmission.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/one-step-request.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/access-request-withdrawal.integration-spec.ts test/integration/requests/spend-supplements.integration-spec.ts`.

### Checkpoint 2 (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `pnpm arch:check` (không cạnh capability ngược tầng); `openapi:export` có `accessRequestResubmit`.
Tự review spec mục 2, 5, 6, 8, 9.

### Phase 3 — chuyển khi mất trưởng phòng (hai pha) và hoàn tất dữ liệu Q-24

### Task 5: đánh dấu trong listener, hoàn tất trong sweep

- Files: `reassignment/one-step-conversion.service.ts` (mới: `markForDepartment`, `finishPending`), `step-routing/one-step-conversion.policy.ts`
  (mới, pure: chọn Request cần đánh dấu/hoàn tất) + `one-step-conversion.policy.spec.ts`, `reassignment/organization-change.listener.ts`
  (chỉ gọi đánh dấu), `reassignment/step-reassignment.service.ts`, `public/step-redetermination-sweep.api.ts` (lượt hoàn tất mỗi pass,
  `SweepResult.oneStepFinished`), `step-routing/step-reassignment.repo.ts` (đọc Request trả phí `VIA_HEAD` ở chỗ trưởng phòng; `ONE_STEP`
  chờ hoàn tất), `step-routing/step-target.service.ts`, `test/integration/requests/one-step-conversion.integration-spec.ts` (mới);
  cập nhật `step-reassignment.integration-spec.ts`, `step-reassignment-paid.integration-spec.ts`, `controlled-wait.integration-spec.ts`,
  `one-step-routing-migration.integration-spec.ts` (phần hoàn tất).
- Depends on: Checkpoint 2; commit W2 cho `organization`.
- Acceptance: test matrix AC-12/L2-02, DA3-16, Q-25, Q-33, sweep, Q-24/DA3-15 (phần hoàn tất).
- Verify: `pnpm exec jest src/modules/requests/step-routing src/modules/requests/reassignment src/modules/requests/public`;
  `pnpm test:integration -- test/integration/requests/one-step-conversion.integration-spec.ts test/integration/requests/one-step-routing-migration.integration-spec.ts test/integration/requests/step-reassignment.integration-spec.ts test/integration/requests/step-reassignment-paid.integration-spec.ts test/integration/requests/controlled-wait.integration-spec.ts`.

### Checkpoint 3 (hết lượt 3)

Kiểm tra nhanh tracker §4.5; tự review spec mục 7, 10 (listener không gọi kiểm ngân sách).

### Phase 4 — hiển thị, thông báo, L2-34, nơi gọi ngoài phạm vi, flow

### Task 6: wire (gỡ `samePersonAsSpend`, `FALLBACK_APPROVER`; thêm `routing`; `accessRequestLineList`), thông báo, L2-34

- Files: `access-request/access-request.dto.ts`, `request-view/*`, `need-decision-queue/need-decision-queue.dto.ts` + mapper,
  `group-request/group-request.dto.ts` (`needStep.state` + `NOT_REQUIRED`), `group-line-decisions/group-line-query.service.ts`,
  `spend-approval-view/spend-approval.dto.ts` + mapper (+ spec), `my-requests/*`, `status/rules/*` (bị chặn khi gửi/lúc duyệt ⟹ người
  yêu cầu; `PRICE_MISSING` ⟹ IT Admin; `NO_NEED_APPROVER` không báo ai), `notifications/public/notifications.types.ts`,
  `notifications/inbox/inbox.policy.ts`, `assessment/assessment.dto.ts` (`superRefine`); test `test/http/requests/need-decision-queue.http-spec.ts`,
  `test/http/requests/my-requests.http-spec.ts`, `test/http/requests/dot-1-removed-fields.http-spec.ts`, `test/http/requests/group-line-closure.http-spec.ts`,
  `test/http/requests/assessment-rejection.http-spec.ts` (mới).
- Depends on: Checkpoint 3.
- Acceptance: test matrix L2-15/DA3-10, L2-34; thông báo của AC-4/AC-11/Q-31 đúng người.
- Verify: `pnpm exec jest src/modules/requests/spend-approval-view src/modules/requests/need-decision-queue src/modules/requests/status src/modules/requests/assessment src/modules/requests/group-line-decisions`;
  `pnpm test:http -- test/http/requests/need-decision-queue.http-spec.ts test/http/requests/my-requests.http-spec.ts test/http/requests/dot-1-removed-fields.http-spec.ts test/http/requests/group-line-closure.http-spec.ts test/http/requests/assessment-rejection.http-spec.ts`;
  `pnpm test:integration -- test/integration/requests/request-status-notifications.integration-spec.ts test/integration/requests/need-decision-queue.integration-spec.ts test/integration/requests/mobile-need-decision.integration-spec.ts`.

### Task 7: nơi gọi ngoài phạm vi (DA3-11), flow, e2e, seed

- Files: thêm ca `AWAITING_REQUESTER_REVISION` vào `test/integration/requests/leaver-request-closure.integration-spec.ts` (hủy khi nghỉ,
  `listOpenOfBeneficiary`), `test/integration/requests/beneficiary-transferred-closure.integration-spec.ts`,
  `test/integration/organization/department-use-open-work.integration-spec.ts` (ngừng phòng/Cost Center),
  `test/integration/dashboards/dashboards-http.integration-spec.ts` (`openRequestsSentBy`); `test/e2e/department-without-head-journey.e2e-spec.ts`
  (viết lại: một bước; phòng đã ghi kế nhiệm thì chờ), `test/e2e/mobile-approver-journey.e2e-spec.ts` (Request của trưởng phòng: một
  quyết định), `test/e2e/free-request.e2e-spec.ts` (nếu dùng phòng không trưởng phòng), `test/flows/mf1-request-contract.flow-spec.ts`,
  `test/flows/mf1-group-request.flow-spec.ts`; seed: chỉ chạy kiểm (spec mục 10).
- Depends on: Task 6.
- Acceptance: test matrix DA3-11 (4 ca), seed; flow/e2e xanh theo luật mới; khẳng định cũ chỉ đổi ở chỗ luật đổi (ghi danh sách vào _Verification_).
- Verify: `pnpm test:integration -- test/integration/requests/leaver-request-closure.integration-spec.ts test/integration/requests/beneficiary-transferred-closure.integration-spec.ts test/integration/organization/department-use-open-work.integration-spec.ts test/integration/dashboards/dashboards-http.integration-spec.ts test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/department-without-head-journey.e2e-spec.ts test/e2e/mobile-approver-journey.e2e-spec.ts test/e2e/free-request.e2e-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts`.

### Checkpoint 4 (hết lượt 4)

Kiểm tra nhanh tracker §4.5; `openapi:export` (trường đổi); README `requests`. Tự review diff toàn hạng mục.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng; danh sách khẳng định flow/e2e đổi theo luật.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).

## Triển khai gói 7 — 09/11/2026

Áp SPEC reaudit §4b: RV-15 giữ cột/enum lịch sử, ngừng ghi cũ bằng trigger từ chối INSERT/UPDATE bật lại giá trị cũ; RV-23 bỏ xét kế nhiệm
khi gửi Request mới (M-15), còn Request cũ đang chờ giữ chờ kế nhiệm đã ghi; RV-26 chỉ gỡ hai đầu vào Business Owner ở SBF-15.
Bốn phase code đã triển khai; unit/integration/http/flow/e2e được viết/cập nhật trước lượt Jest đầu theo yêu cầu Owner.

TẠM CHỌN: catalog còn bắt cột Business Owner nên adapter đăng ký nội bộ suy legacy owner từ requester để tương thích lưu trữ,
không cần cho IT nhập/chọn; phạm vi dọn Business Owner toàn catalog thuộc hạng mục riêng. `one_step_blocked_reason` lưu lý do thiếu
số liệu (PRICE_MISSING/RATE_MISSING), không tạo snapshot kiểm ngân sách giả. Need `NOT_REQUIRED` giữ scalar SLA lịch sử trong DB,
response trả SLA null và sweeper không đọc bước này. Request một bước không phát thông báo `REQUEST_SUBMITTED` (spec không yêu cầu).

Hàm kiểm của gói 3 (`SpendRoutingService.route`) được dùng trực tiếp cho gửi/gửi lại/duyệt/hoàn tất chuyển. Graph dùng chung cung cấp
cổng check/routing cho API và worker. Listener tổ chức chỉ đánh dấu sau khóa phòng và khóa union Request theo id; sweep hoàn tất từng
Request một transaction. Kiểm lại dưới khóa Request để không chuyển nhầm khi bước chi đã được mở đồng thời.

Đã viết thêm coverage khi rõ trong giai đoạn 2: dữ liệu migration paid/group/nhu cầu đã duyệt, gửi lần đầu dùng dự phòng,
bổ sung thực qua API, RATE_MISSING, và retry độc lập khi một Request chuyển bước gặp lỗi.

Các khẳng định hồi quy đã đổi: trưởng phòng tự gửi chỉ có quyết định chi (bước nhu cầu `NOT_REQUIRED`, `routingRow` 2); nhóm chứa trưởng phòng
bị từ chối `HEAD_IN_GROUP`; Request mới trong khoảng trống kế nhiệm đi một bước; K5 đã chờ trước lúc mất trưởng phòng vẫn chờ (giữ
`routing_row` đã định tuyến); Request trả phí đã gửi trước lúc mất trưởng phòng được chuyển thành một bước; Request cũ có kế nhiệm tương lai
được giao kế nhiệm khi hiệu lực. Giữ nguyên các khẳng định MF-2/MF-3 và luồng nhân viên trong phòng có trưởng phòng.

### Bằng chứng (nhánh `feat/mf1-g7`, worktree `be-mf1-g7`, 09/11/2026)

| Lệnh                                                                                                                                                                                                 | Kết quả thật                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `arch:check`, `rules:check`, `format:check`, `arch:docs:check`, `prisma:validate`                                                                                                  | exit 0                                                                                                                                                          |
| `pnpm lint`                                                                                                                                                                                          | 0 lỗi (đã sửa 1 lỗi `no-unsafe-member-access` ở `one-step-routing-migration.integration-spec.ts`)                                                               |
| `pnpm test` (unit)                                                                                                                                                                                   | 389 suite, 4 993 test, 0 lỗi                                                                                                                                    |
| `pnpm test:gates`                                                                                                                                                                                    | 16 suite, 330 test, 0 lỗi                                                                                                                                       |
| `pnpm test:http`                                                                                                                                                                                     | 78 suite: 77 xanh; 1 suite đỏ do `openapi-presentation` (mô tả `PackageResponseDto` của gói 5 chứa mã `QĐ-100h`/`QĐ-109c`) — không thuộc gói 7, sửa ở nhánh gom |
| `pnpm test:integration` — 16 file của gói 7 (định tuyến một bước, migration, chuyển khi mất trưởng phòng, bổ sung/tỷ giá, nhóm, hàng đợi nhu cầu, chờ có kiểm soát, thông báo, rút lại, điều chuyển) | 16/16 suite xanh sau khi cập nhật test cũ theo luật một bước                                                                                                    |
| `pnpm test:integration` — 13 file còn lại của plan (seed, seed-rerun, gia hạn, đóng do nghỉ việc/điều chuyển, dashboards, nội bộ, dịch vụ, bổ sung chi, constraints)                                 | 13/13 suite, 247 test xanh                                                                                                                                      |

`pnpm check`, `test:e2e`, `test:flows`, `test:scripts`, `test:integration:serial` và toàn bộ integration CHƯA chạy ở nhánh này — chạy ở nhánh gom.
Chưa xác nhận review/accepted.
