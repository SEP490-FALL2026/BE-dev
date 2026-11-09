# QĐ-93 BE — báo cáo implement (bản giao 03/11/2026: #1–#6)

Repo: `Code/BE-dev-software-license-management`. SHA dev ban đầu: `03da6c4f`. Chi tiết từng bước:
`NOTE MD/qd93-implementation-progress.md`; log subagent: `NOTE MD/qd93-logs/`.

**DỪNG 03/11 ~06:10 theo Owner** (chuyển qua phiên audit "SEP-Start 59"): bản giao hôm nay CHỈ gồm #1–#6
(tip `feat/qd93-remove-fallback-substitute-approvers` = `b18ad761`). #7–#11 sang đợt sau. Không push, không merge.

**pnpm check và test toàn bộ CHƯA chạy — Claude chạy khi audit.** Từ #6 A3 trở đi (quy trình 4) integration/e2e chỉ
VIẾT, không chạy, kể cả theo file.

## 1. Bảng hạng mục

| # | Hạng mục | Nhánh | Nhánh cha | SHA cuối | Trạng thái |
| - | -------- | ----- | --------- | -------- | ---------- |
| 1 | qd93-remove-hr-basis-org-writes | feat/qd93-remove-hr-basis-org-writes | dev 03da6c4f | 164f6e67 | done |
| 2 | qd93-remove-in-app-super-admin-transfer | feat/qd93-remove-in-app-super-admin-transfer | #1 164f6e67 | 7daf6856 | done |
| 3 | qd93-parameter-labels-dashboard-queues | feat/qd93-parameter-labels-dashboard-queues | #2 7daf6856 | 10e4a56d | done |
| 4 | qd93-direct-manager-spending-approver-roles | feat/qd93-direct-manager-spending-approver-roles | #3 10e4a56d | 99b7234e | done |
| 5 | qd93-remove-department-projects (chỉ phase 1) | feat/qd93-remove-department-projects | #4 99b7234e | 3f93c788 | done (phase 1) |
| 6 | qd93-remove-fallback-substitute-approvers (chỉ phase A) | feat/qd93-remove-fallback-substitute-approvers | #5 3f93c788 | b18ad761 | done (phase A; Task 10, 12 bỏ — DB mới) |
| 7 | qd93-unplaced-employee-first-placement | feat/qd93-unplaced-employee-first-placement | #6 b18ad761 | 1d2b94a6 (+12 file chưa commit) | dừng — sang đợt sau |
| 8 | qd93-code-format-xlsx-employee-import | — | — | — | chưa làm |
| 9 | employee-directory-read | — | — | — | chưa làm |
| 10 | qd93-budget-record-attachments | — | — | — | chưa làm |
| 11 | dashboard-request-queues-wiring | — | — | — | chưa làm |

Tất cả nhánh #1–#6 có working tree sạch tại SHA cuối (kiểm bằng `git status` khi chốt từng hạng mục).

## 2. Từng hạng mục

### #1 qd93-remove-hr-basis-org-writes — 164f6e67
- Task 1.1–1.4, 2.1–2.4 xong. Verify opus PASS (AC trong bảng Primary Story/AC có test; 10 operation bỏ `hrBasis` đúng spec).
- Đã chạy (trước khi Owner đổi quy trình): `pnpm check` exit 0 (unit 4453, gates 326, scripts 272/0 fail/2 skip);
  `rules:check` 0; `openapi:export` không drift; http/integration theo file xanh (347+90+129+90+100+101+88).

### #2 qd93-remove-in-app-super-admin-transfer — 7daf6856
- Task 1–4 xong + fix vòng 1 (test AC-4 rollback CLI transfer-role). Verify opus PARTIAL → re-check PASS (đột biến bỏ
  transaction ⟹ ca AC-4 đỏ).
- Đã chạy: `pnpm check` exit 0 (unit 4444, gates 326, scripts 274); integration 5 file 51/51; http platform 188/188;
  `super-admin-recovery-role` 24/24.

### #3 qd93-parameter-labels-dashboard-queues — 10e4a56d
- Task 1–3 xong. Verify opus PASS (đột biến `unitLabel` ⟹ đỏ; không AC thiếu test).
- Đã chạy: `pnpm check` exit 0 (unit 4451, gates 326); http 75; integration theo file 27/6/9 + 4 + 11 + 11; openapi không drift.

### #4 qd93-direct-manager-spending-approver-roles — 99b7234e
- Task 0.1, 0.2, 1–15 xong (lượt cuối do phiên Codex tiếp quản).
- Đã chạy: bộ kiểm nhanh cuối (typecheck, lint, arch:check, rules:check, gates 326/326, openapi không drift); theo file:
  integration lượt 1 17/19/10/9/13 + 103 file liên quan vai duyệt; unit 718; http 211; Checkpoint 3 (department-head-http
  30, department-transfer-record 23, department-transfer-change 18, offboarding-record 14, offboarding-change 10,
  personnel-notice-record 22, super-admin-event-cli 15, super-admin-event-service 33, manager-scope 19, unit 50);
  Task 13 (inspection 11, role-duties 10, demo-dataset 7, rerun 3, operational-commands gate 15); Task 14 account-list
  4/4; Task 15 http platform 42/42, API collection gate 34/34.
- Verify opus riêng cho #4: không chạy (lượt cuối do phiên Codex làm, sau đó Owner bỏ bước này).

### #5 qd93-remove-department-projects (phase 1) — 3f93c788
- Phase 1A.1, 1A.2, 1B.1, 1B.2, 1B.3 xong; KHÔNG làm phase 2 (drop bảng).
- Đã chạy: bộ kiểm nhanh exit 0 (+ arch:docs:check, prisma:validate); drift DB-16 "No difference"; http 15 file/288;
  integration 8 file/117; unit 11 spec/142.

### #6 qd93-remove-fallback-substitute-approvers (phase A) — b18ad761
- A1 (Task 1, 2, 3, 3b) 6c4547ca · A2 (Task 4, 5, 6) 12d85427 · A3 (Task 7, 8, 8b, 9) c9eaf4a3 · A4 (Task 11) b18ad761.
- Bỏ theo Owner (DB mới, 03/11): Task 10 `ops:approval-role-conversion` + test của nó; runbook chuyển đổi trong Task 11;
  Task 12 (preflight Phase B); dòng Checkpoint A "chuyển đổi đã chạy ở mọi môi trường" = N/A. Phase B (Task 13) không làm.
- Verify opus: bỏ theo quy trình 3 (Owner 02/11 22:50) — audit sẽ review/thử đột biến.
- Đã chạy:
  - A1: bộ kiểm nhanh exit 0; unit 949; integration 11 suite/225; http 129; đột biến `legacy` ⟹ 6 ca đỏ.
  - A2: bộ kiểm nhanh exit 0; http 249; unit 1644/1645 (ca đỏ được sửa ở A3); integration checkpoint 6 file 97/97;
    concurrency xanh 3 lượt; đột biến ⟹ 16 ca đỏ.
  - A3 + Checkpoint A (A4): typecheck, lint, arch:check, rules:check, arch:docs:check, rules:format, openapi:export
    (không drift) exit 0; gates 16 suite/327; HTTP 18 suite/264; unit toàn bộ 331 suite/4539; unit demo/dev-seed 10 suite/74.
- Integration/e2e ĐÃ VIẾT, CHƯA CHẠY (audit chạy):
  - `test/integration/requests/`: spend-approver-revoke-race (mới), spend-routing, spend-batches, mobile-spend-approval,
    spend-review-flows, assessment-queue, access-request-new-software, access-request-internal-path,
    request-status-notifications, spend-finance-information.
  - budgets/budget-version-history; licensing/subscription-renewal-decision; organization/{budget-notices,
    organization-identity-read-contracts}; identity-access/{direct-approval-roles, direct-approval-roles-concurrency};
    personnel/role-duties; notifications/step-sla; audit/access-request-need-decision; installation/inspect.
  - e2e: `test/e2e/paid-request-to-seat.e2e-spec.ts` (phòng thiếu trưởng phòng → chờ → gán → duyệt → lô → Người duyệt chi),
    `test/e2e/mobile-approver-journey.e2e-spec.ts` (hồi quy `deciderRole`).
  - Đã xóa: spend-substitute, approval-roles-http, approval-roles.http-spec (thay bằng approval-roles-removed.http-spec).
- Lượt integration cuối có chạy là "đỏ trước" của Task 7 (11/84 ca đỏ, đúng dự kiến); sau đó chưa có lượt xanh xác nhận.

## 3. Bảng "test cũ → test mới" (hạng mục gỡ tính năng)

Bảng đầy đủ nằm trong bảng bằng chứng của plan từng hạng mục (mỗi dòng: test cũ file:tên → test mới file:tên):
- #5: `docs/workspace/items/qd93-remove-department-projects/plan.md` — 16 dòng (route/trường projects, projectLabel → 404,
  trường không còn).
- #6: `docs/workspace/items/qd93-remove-fallback-substitute-approvers/plan.md` — 62 dòng: A1 dòng 1–21, A2 dòng 22–30,
  A3 dòng 31–60, A4 dòng 61–62 (FALLBACK_APPROVER, CONFLICT_SUBSTITUTE, /approval-roles → 404, người thay thế ở bước chi,
  hint/waitingReason cũ, approver là bên của Request → 422 REQUEST_PARTY.INELIGIBLE).
- #1, #2 cũng gỡ tính năng (hrBasis, super-admin-transfers); test thay ghi trong evidence plan của mỗi hạng mục (làm
  trước khi Owner yêu cầu bảng ánh xạ).

## 4. Lệch spec và câu hỏi Owner

Giữ hành vi code có từ trước (theo bổ sung Owner): grant role 201; revoke 200 `ROLE.REVOKED`; PATCH phòng ban body rỗng
422 `DEPARTMENT.UPDATE_EMPTY`.

Đã được Owner trả lời (03/11): Task 12 #6 bỏ; ngoại lệ `GRAPH_WIRING_EXCEPTIONS` của gate extension-wiring (A3) giữ — audit
soát câu chữ reason.

Lệch còn để audit/Owner xem:
- #1: sàn date-leaf openapi-request-rules 96→92 (gỡ hrBasis); status plan/spec/roadmap chưa cập nhật.
- #2: AC-8 biến thể 401 (Low), AC-5 yếu hơn test cũ.
- #3: roadmap.md:302 chưa cập nhật; `registry-exceptions.ts:81` removeWhen trỏ tên file cũ.
- #4: `/me` đổi contract (FE phải thích ứng); trần lint-debt hạ.
- #5: Project/ProjectDepartment giữ trong PRISMA_MODEL_OWNER (gate architecture-boundaries) → Task 2.2 phase 2; sàn
  date-leaf 92→91; `request-harness.ts`, `department-harness.ts` đổi và dùng rộng ⟹ cần full integration + e2e
  paid-request-to-seat khi audit.
- #6:
  1. DTO `cancellation.cancelledBy` nullable + enum `cause`/`cancelCause` thêm `SPENDING_APPROVER_PARTY` (openapi đổi, spec chưa ghi).
  2. Gợi ý cấu hình cũ ánh xạ `ASSIGN_DEPARTMENT_HEAD`/`CONFIGURE_SPENDING_APPROVER`; preview bỏ `HEAD_IS_THE_APPROVER`,
     `DEPARTMENT_HAS_NO_HEAD`.
  3. Gia hạn khóa `FOR SHARE` nhân viên người gửi (giữ thứ tự khóa nhân viên → tài khoản; spec nói gia hạn không khóa nhân viên).
  4. Tạo thay: người thụ hưởng không tồn tại vẫn `OUTSIDE_DEPARTMENT` nhưng sau phán định bên.
  5. Khóa grant `FOR SHARE` ở openSpend / VersionService.send / RenewalProposalService.propose.
  6. Thêm RequestSenderService, RenewalSeatFactsService (max-params); gate module-graph export `RequestPartyEligibilityApi`;
     sổ collection thêm sự kiện QĐ-93c; trần lint-debt 57/52/109.
  7. Không còn trigger phát `QD93_CONVERSION`; giá trị/nhánh đóng băng `STEP_AWAITING_CONVERSION` vẫn giữ (DB mới không có bước đóng băng).
  8. Hai giả định e2e chưa kiểm: người không phải người nhận bước/lô → 404; Super Admin có `CONTROLLED_WAIT_ALERT` sau `project()`.
- VIỆC TREO: ghi 2 quyết định Owner 03/11 (Task 12 bỏ; Checkpoint A "chuyển đổi…" = N/A) vào
  `docs/workspace/items/qd93-remove-fallback-substitute-approvers/plan.md` — CHƯA ghi vì lệnh dừng cấm sửa nhánh #1–#6.

## 5. Migration mới

| # | Thư mục migration |
| - | ----------------- |
| 1 | — |
| 2 | `20261102043614_identity_app_user_employee_immutable` |
| 3 | — |
| 4 | `20261102080428_identity_direct_roles_values`, `20261102082906_identity_direct_roles` |
| 5 | — |
| 6 | `20261102202711_requests_spending_approver_party_values`, `20261102202712_requests_spending_approver_party_cancellation` |
| 7 (dừng, chưa giao) | `20261102223100_organization_placement_keep_one` |

`scripts/verify/merged-migrations.txt` không sửa.

## 6. #7–#11 (đợt sau)

- #7: nhánh `feat/qd93-unplaced-employee-first-placement` giữ nguyên. Commit: A.1 `e25ca495` (trigger INV-20
  `employee_placements_keep_one`), A.2 `987b296c` (placement-coverage), A.3 `1d2b94a6` (test đỏ hồ sơ không phòng;
  integration viết, chưa chạy). 12 file chưa commit = phần dở Task A.4 (writer `createEmployee` placement tùy chọn), giữ
  nguyên theo lệnh dừng, chưa qua bộ kiểm nhanh. Còn: A.4–A.5, Checkpoint A, phase B, C, D. Log:
  `qd93-logs/A-qd93-unplaced-employee-first-placement-A.md`.
- #8–#11: chưa làm, chưa tạo nhánh.

## 7. Quy trình đã áp (Owner, ghi đủ trong progress)

1–2: bộ kiểm nhanh thay `pnpm check`; mỗi Phase một implementer sonnet/high. 3: bỏ verify opus #6/#7/#10.
4: viết integration/e2e nhưng không chạy. 5: VPS mới, DB trống — bỏ task/test chỉ xử lý dữ liệu cũ. Dừng 03/11 ~06:10.
