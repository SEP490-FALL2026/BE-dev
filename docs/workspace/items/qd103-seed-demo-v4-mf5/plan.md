# Plan: qd103-seed-demo-v4-mf5

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9e83c86` (sau `qd103-seed-demo-v4-mf1` Checkpoint B).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI (subagent chat review, W7).
- Owner review: chưa review. Peer review: cổng thiết kế W7 — đã chạy 09/11/2026 (`design-audit-w7.md`), đã sửa (mục _Design review_).
- Triển khai: `not-started`. PR: chưa có. Cỡ ước: M ≈ 11h, ~19 file ⟹ 2 phase, mỗi phase một commit `feat(qd103-w7): seed-demo-v4-mf5 P<n>`.

## Before coding

- Điều kiện: W1 → W6 PASS; `qd103-seed-demo-v4` Checkpoint C (seat Figma/Jira nền, wrapper API mới trước apply, đo thời gian apply ≤ 4 phút);
  `qd103-seed-demo-v4-mf1` Checkpoint B.
- Đối chiếu trong `openapi.json`: body `usageSourceCreate`, `usageImportUpload` (multipart), `usageImportConfirm` (`previewVersion`, `notice`,
  header `Idempotency-Key`), `longLeaveStart`, `offboardingCaseRecord`, `departmentTransferRecord`, `transferReviewDecide` (`STILL_NEEDED`/`NOT_NEEDED`),
  `appUserCreate`, `departmentHeadAssign`, `ghostSeatRuleRunList` (trường thời điểm bắt đầu lượt, `periodKey`), và mọi `operationId` mục 5 của spec. Chốt
  giá trị `notice` của W6 (`SYSTEM_SEND`/`SYSTEM_SENT`).
- Xác nhận ở code W6/MF-2 rằng ghi nghỉ việc **không** tự mở tác vụ thu hồi (Q-102); nếu có ⟹ dừng, ghi lệch và hỏi chat review.
- Xác nhận ở code MF-3: cách _giữ seat ở phòng mới_ (DM5-37 — `transferReviewDecide` `STILL_NEEDED` hay Request xin lại) và ai mở tác vụ thu hồi khi hết
  chồng lấn (DM5-30); lệch ⟹ sửa dòng bảng theo hợp đồng có sẵn, không đổi API.
- Xác nhận `chargeDepartmentId` của seat NV-MOV1 sau điều chuyển (phòng chịu seat-tháng); MOV1 sang ENG nên không chạm MKT/SAL, chỉ ghi kết quả vào README.
- Kiểm tra nhanh theo tracker §4.5 mỗi task; không `pnpm check`, không full suite.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 09/11/2026 (`design-audit-w7.md`). Hạng mục này nhận DA7-03 (Cao, vế chốt lượt đầu), DA7-04 (Cao), DA7-06 (Cao,
vế DM5), DA7-18, 19, 20, 21, 22, 28 ⟹ đã sửa trong spec: step `jobs.first-pass-guard` (Task 4), `G3` trên nguồn Jira tươi với NV-DES3 vắng (Task 1, 2),
định danh lạ `D0−119` tránh CF-7, thứ tự dòng theo `scenarioDay`, DM5-30 gồm tác vụ IT, DM5-35 (`QĐ-108i`), DM5-37 (R-J03 + ngoại lệ GH-1 chồng lấn),
mức tin cậy kỳ vọng từng dòng (DES2 `D0−110` ⟹ `MEDIUM`, DES1 `D0−80` ⟹ `HIGH`), nguồn `ABRUPT_DEPARTURE`, DM5-33 nêu `appUserCreate` + lượt job,
DM5-22 tác vụ `CANCELLED`, `granted_on` `D0−130` (ở spec nền), thêm DM5-34, DM5-36. Sửa khác đề xuất: DA7-21 vế `REVOCATION_CANCELLED` không áp (DM5-23
quyết lại là Thu hồi); DA7-28 không thêm Microsoft 365 (catalog dùng Google Workspace — BRD 3.4 cho phép một trong hai). Finding không sửa: không có.

## Tasks

### Phase 1 — dữ liệu

### Task 1: bộ sinh file usage và đáp án

- Files: `src/cli/seed/demo-usage-report.ts` (mới, thuần), `src/cli/seed/demo-usage-report.spec.ts`, `src/cli/seed/fixture/shared-demo-v4/usage.ts`
  (mới: ba nguồn, lần nhập I1–I3, bảng hồ sơ Figma + Jira), `src/cli/seed/fixture/shared-demo-v4.spec.ts` (`expectedGhostSeats` gồm `G1`, `G2`, `G3`/`G4`
  kèm tầng + mức tin cậy; `TC-2` = 0).
- Depends on: `qd103-seed-demo-v4-mf1` Checkpoint B.
- Acceptance: test matrix _bộ sinh file usage_, _đáp án `TC-1`/`TC-2`_.
- Verify: `pnpm exec jest src/cli/seed/demo-usage-report.spec.ts src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Task 2: step usage — nguồn, nhập, xác nhận có thông báo

- Files: `src/cli/seed/steps/usage.steps.ts` (thay bản W6; xóa `fixture/shared-demo-v3/usage.ts` nếu còn; IT Admin phụ trách ứng dụng nhập),
  `src/cli/seed/demo-run.types.ts`, `src/cli/seed/seed-steps.ts`.
- Depends on: Task 1.
- Acceptance: spec mục 1; chạy lại `present`, không nhập lại.
- Verify: `pnpm exec jest src/cli/seed`.

### Task 3: step nhân sự — nghỉ dài, nghỉ việc chặn ngay, điều chuyển DES → ENG

- Files: `src/cli/seed/fixture/shared-demo-v4/personnel.ts` (mới), `src/cli/seed/steps/personnel.steps.ts` (mới), `src/cli/seed/steps/organization.steps.ts`
  (tài khoản bị chặn sau nghỉ việc ⟹ `present` khi chạy lại), `src/cli/seed/seed-steps.ts`.
- Depends on: Task 2.
- Acceptance: spec mục 3.
- Verify: `pnpm exec jest src/cli/seed`.

### Task 4: step `jobs.first-pass-guard`

- Files: `src/cli/seed/steps/first-pass-guard.steps.ts` (mới, chỉ đọc `ghostSeatRuleRunList`), `src/cli/seed/steps/first-pass-guard.steps.spec.ts`,
  `src/cli/seed/seed-steps.ts` (step cuối, `needs` mọi step ghi).
- Depends on: Task 3.
- Acceptance: spec mục 4; test matrix _chốt lượt job đầu_.
- Verify: `pnpm exec jest src/cli/seed/steps/first-pass-guard.steps.spec.ts src/cli/seed`.

### Checkpoint A

Kiểm tra nhanh §4.5 xanh; `pnpm exec jest src/cli/seed` xanh. Commit `… P1`.

### Phase 2 — kiểm chứng

### Task 5: integration seed phần MF-5

- Files: `test/integration/installation/seed.integration-spec.ts`, `seed-rerun.integration-spec.ts`.
- Depends on: Checkpoint A.
- Acceptance: các dòng integration của test matrix (gồm guard `done` trên DB trống, `present` khi chạy lại); thời gian apply toàn bộ (ba hạng mục) ghi
  vào _Verification and handoff_; > 4 phút ⟹ dừng, báo chat review (Q-99).
- Verify: `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Task 6: flow `@MF5`, README

- Files: `test/flows/demo-mf5.flow-spec.ts` (mới, `@MF5 @DEMO`, DM5-01 → DM5-37: dòng `D0` theo bảng, dòng có ngày sắp theo `scenarioDay`; DM5-35, DM5-37
  trong `describe` world riêng; lượt rule chạy bằng pass của W6 đăng ký trong `flow-world.ts`, đồng hồ ở `D0`), `test/support/flows/demo-scenarios.ts`
  (ID, khóa _Khi_ và `DEMO_SCENARIO_OPERATIONS` phần MF-5), `test/support/flows/flow-world.ts` (pass `internal-rules`, `usage-rules`, `decision-follow-up`,
  điều chuyển nếu W6/MF-3 chưa đăng ký), `src/cli/seed/fixture/shared-demo-v4/README.md` (hồ sơ MF-5 + mức tin cậy, đáp án, _Lượt job đầu_).
- Depends on: Task 5.
- Acceptance: test matrix _MF-5 từng bước_, _consumer_; không `FlowClockError`.
- Verify: `pnpm test:flows -- test/flows/demo-mf5.flow-spec.ts test/flows/mf5-ghost-seat.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`;
  `pnpm rules:format` rồi `pnpm rules:check`.

### Checkpoint B

Kiểm tra nhanh §4.5 xanh; test theo file Task 4–6 xanh; "`pnpm check` và test toàn bộ CHƯA chạy". Commit `… P2`. Đợt W7 xong phía code ⟹ chat review R2.

## Verification and handoff

| Lệnh / kiểm tra AC               | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                          |
| -------------------------------- | --------------------- | ----------------- | ------------------------------------------------ |
| (chưa chạy)                      | —                     | —                 | lượt quét thật trong API demo kiểm ở W9 (DM5-01) |
| thời gian apply toàn bộ (Task 5) | —                     | (điền số giây)    | > 240 s ⟹ báo chat review (Q-99)                 |

- [ ] AC trong scope có bằng chứng; lệch so với thiết kế ghi ở cột _Giới hạn_ trên.
- [ ] Giao chat review (R2) SHA hai commit.
