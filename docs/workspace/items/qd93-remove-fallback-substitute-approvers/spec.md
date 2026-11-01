# Spec: qd93-remove-fallback-substitute-approvers — bỏ approver dự phòng và người duyệt chi thay thế; Người duyệt chi không có luồng xin cấp

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 01/11/2026, sau `QĐ-93`); chỉ là bản thiết kế, chưa implement.
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: audit độc lập
  01/11/2026 (B1, H1→H5, M1→M7, LOW) và review vòng 2 02/11/2026 (luật bước chi cũ, hợp đồng `D-S21`) — xử lý ở
  `## Changes and acceptance`.
- Nguồn: Docs `69e8a3d` (BRD v3.58 — 4.3, `FR-3.6`, `FR-3.12`, `FR-3.13`, `FR-3.15`, `FR-3.16`, bảng ngoại lệ 5.3; User
  Stories 01/11/2026 — 143 Story đang dùng, 1 586 AC, `US-06-08` `RETIRED`; `QĐ-93c`, `QĐ-93d`, `QĐ-93k`), BE `1a77ffe8`.
- Bổ sung sau pin: `QĐ-93d`(1) `D-S16`, `QĐ-93g`(5) `D-S14`, `QĐ-93j`(3) `D-S15` — Docs chưa commit lúc ghi (01/11/2026); cập
  nhật pin khi Owner commit. Hạng mục này dùng `QĐ-93d`(1) `D-S16` (BRD bảng cảnh báo _Chưa có người duyệt hợp lệ_, `US-12-15`
  dòng 27 viết lại).
- Bổ sung sau pin: `D-S17`…`D-S26` (Docs chưa commit) — Owner 01/11/2026. Hạng mục này áp `D-S20` (bước nhu cầu chờ
  `NO_DEPARTMENT_HEAD` dùng cảnh báo controlled-wait sẵn có), `D-S21` (hạng mục này **sở hữu** policy chung và hợp đồng 422 +
  `blockedBy` của preview), `D-S22` (tạo thay tất cả hoặc không), `D-S23` (hồ sơ bổ sung không có đường thêm người), `D-S26`
  (quyền chạy test, plan); OD-7 đã duyệt và Docs ghi vào `QĐ-93k`.
- Nhóm roadmap: G2, G5, G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- Thay thế một phần (_superseded_ ở phần nêu): `g2-approval-roles` (người thay thế, approver dự phòng, route
  `/approval-roles`); `g5-request-submission-and-routing` (dòng 3, 4 của bảng định tuyến); `g5-spend-submission-batches`
  (`US-06-14` AC-8 cũ — đi thẳng bước chi khi không ai trình); `g5-spend-approval-decision` (người thay thế khi xung đột,
  `US-06-08`); `g5-step-reassignment-and-controlled-wait` (lý do chờ/gợi ý của hai vai); `g5-budget-version-decision` và
  `a06-renewal-proposal-decision` (người thay thế quyết phiên bản/gia hạn); `g6-leaver-role-and-workspace-duties` (cờ
  `SUBSTITUTE_APPROVER`, `FALLBACK_APPROVER`).
- [Kế hoạch](plan.md).

## Business outcome

Không còn vai, cấu hình, route hay nhánh định tuyến nào cho approver dự phòng và người duyệt chi thay thế: bước nhu cầu của
phòng chưa có trưởng phòng **chờ có kiểm soát** với lý do `NO_DEPARTMENT_HEAD` (Super Admin nhận cảnh báo controlled-wait sẵn
có — `D-S20`) và được giao trưởng phòng mới khi Super Admin gán (hạn không đặt lại); không còn tạo thẳng bước chi cho phòng
thiếu trưởng phòng; mọi bước chi, quyết định phiên bản ngân sách và quyết định gia hạn chỉ giao Người duyệt chi hoặc chờ;
Người duyệt chi bị từ chối ngay khi tạo mọi loại Request (người yêu cầu, người thụ hưởng, người chịu trách nhiệm tài khoản dịch
vụ) bằng **một** mã 422 dùng chung (`REQUEST_PARTY.INELIGIBLE`, `D-S21`) và không xuất hiện trong danh sách chọn người thụ
hưởng. Dữ liệu cũ đứng yên (đóng băng) từ lúc bản mới chạy tới khi lệnh vận hành idempotent `pnpm ops:approval-role-conversion`
đóng Request có Người duyệt chi là bên và xác định lại bước cũ; sau đó mới gỡ bảng. Kiểm được bằng unit policy, integration
trên PostgreSQL riêng và một hành trình e2e.

## Sizing decision

- Container: G2, G5 và G8 (giao việc `QĐ-93` của Owner 01/11/2026) — container giao việc, không phải ranh giới hạng mục.
- Mode: `grouped-stories`.
- Outcome and owner: chuỗi duyệt không còn người thay thế/approver dự phòng và Người duyệt chi không bao giờ là bên của
  Request; capability sở hữu `requests` (định tuyến, reassign, tạo Request, chi, chuyển đổi), `identity-access/request-party`
  (hợp đồng chung `D-S21`), `budgets/version`, `licensing/subscription-renewal`, `licensing/provisioning` (đổi người chịu trách
  nhiệm, nguyên nhân hủy mới), `identity-access/approval-roles` (gỡ), `personnel/role-duties`, lệnh vận hành mới.
- Boundaries: Phase A — mỗi lệnh tạo Request giữ transaction hiện có và gọi `RequestPartyEligibilityApi.assertEligible` (khóa
  `FOR SHARE` tài khoản các bên, không khóa nhân viên) sau khóa nhân viên hiện có của route, trước mọi đọc phòng/Cost Center và
  mọi insert; định tuyến/reassign trong transaction của sự kiện nguồn như hiện hành, khóa
  grant `SPENDING_APPROVER` `FOR SHARE` trước khi khóa Request khi giao bước chi/gửi phiên bản; một migration giá trị enum + một
  migration nới hai ràng buộc hủy; bước cũ đóng băng tới khi lệnh chuyển đổi chạy (ngoài HTTP, mỗi Request một transaction).
  Phase B — một migration gỡ bảng/hàm, triển khai riêng sau khi lệnh chuyển đổi đã chạy. Quyền route không đổi; bỏ
  `GET/PUT /api/v1/approval-roles`.
- Not larger: vai gán trực tiếp và ràng buộc khi gán (`qd93-direct-manager-spending-approver-roles`); chuyển giao Super Admin
  (`qd93-remove-in-app-super-admin-transfer`); nhân viên chưa xếp phòng (`QĐ-93g`, `qd93-unplaced-employee-first-placement` —
  thêm nhánh `UNPLACED` vào **cùng** policy của hạng mục này); cảnh báo chủ động dòng 9 _phòng thiếu trưởng phòng_ (`D-S20`,
  yêu cầu riêng); hợp thức hóa `US-13-06` AC-22 (G9 chưa có trong BE).
- Not smaller: bỏ hai vai là một thay đổi kiểu dữ liệu (`ApprovalRoleHolders`, `DeciderRole`, `WAITING_REASON_CODES`) dùng
  ở mọi người tiêu dùng; tách theo người tiêu dùng để lại kiểu nửa vời và bảng không gỡ được; chặn Người duyệt chi ở bước tạo
  là điều kiện để bỏ người thay thế khi xung đột (không còn ca xung đột) và lệnh chuyển đổi dọn đúng phần dữ liệu đó.
- Siblings: [`qd93-direct-manager-spending-approver-roles`](../qd93-direct-manager-spending-approver-roles/spec.md) (đi
  trước, cùng bản phát hành), [`qd93-remove-department-projects`](../qd93-remove-department-projects/spec.md) (phase 1 đi
  trước), [`qd93-remove-in-app-super-admin-transfer`](../qd93-remove-in-app-super-admin-transfer/spec.md),
  [`qd93-unplaced-employee-first-placement`](../qd93-unplaced-employee-first-placement/spec.md) (đi sau, thêm nhánh `UNPLACED`).
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2), [G5](../../../roadmap.md#work-item-decomposition-g5), [G8](../../../roadmap.md#work-item-decomposition-g8).

## Size exception

- Cohesion: mọi AC dưới đây là hệ quả trực tiếp của hai quy tắc — không có người thay thế/approver dự phòng (`QĐ-93c`,
  `QĐ-93d`(1)) và Người duyệt chi không là bên của Request (`QĐ-93d`(2)) — cùng một bộ kiểu dữ liệu, một policy chặn dùng chung
  và một lệnh chuyển đổi; mỗi loại Request chỉ thêm một lời gọi tới cùng policy.
- Why not split: tách theo loại Request (đơn, nhóm, tạo thay, tài khoản dịch vụ, gia hạn, hoàn trả) lặp policy và test khóa
  sáu lần, và trong lúc chưa đủ thì vẫn cần người thay thế khi xung đột — không gỡ được bảng; tách phiên bản ngân sách/gia hạn
  ra thì `ApprovalRoleHolders.conflictSubstituteEmployeeId` sống tiếp chỉ cho hai người tiêu dùng đó.
- Checkpoints: Phase A1 (định tuyến, reassign, đóng băng), A2 (policy chung + mọi đường tạo + danh sách chọn + preview), A3
  (chi, phiên bản, gia hạn, role-duties, gỡ route), A4 (lệnh chuyển đổi), rồi Phase B (gỡ bảng) là lần triển khai riêng — chi
  tiết ở [plan](plan.md); mỗi phase có gate và rollback riêng.
- Maximum scope: chỉ AC trong bảng dưới; **không** thêm trạng thái chưa xếp phòng (chỉ chừa chỗ nhánh `UNPLACED` trong policy),
  không đổi giới hạn/quyền route khác, không thêm loại cảnh báo ngoài danh mục `US-12-15`, không xây đường _thêm người_ cho hồ
  sơ bổ sung (`D-S23`), không đụng hợp thức hóa G9.
- Accepted by: Owner 01/11/2026 — duyệt thiết kế chia việc `QĐ-93` (Docs `69e8a3d`, _Người quyết_ của `QĐ-93`); review toàn
  spec còn chờ.

## Primary Story/AC

| Story    | AC                 | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-02 | AC-10              | partial  | AC-3: `qd93-direct-manager-spending-approver-roles`; AC còn lại giao trước GOV.1 ở `g2-department-profile`                                                                                                                                                                                                                                                                |
| US-03-02 | AC-15              | partial  | AC-15 vế _chưa xếp phòng_ (nhánh `UNPLACED` của cùng policy): `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-delegated-requests`                                                                                                                                                                                                                               |
| US-05-01 | AC-16              | partial  | AC-16 vế _chưa xếp phòng_ (`blockedBy.reason = UNPLACED`): `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-request-preview`, `a01-employee-catalog-selector`                                                                                                                                                                                                    |
| US-05-02 | AC-13              | partial  | AC-14: `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-request-submission-and-routing`, `g5-request-amount-and-payment-schedule`, `g5-group-requests`, `g5-delegated-requests`, `g5-it-assessment-of-new-software`                                                                                                                                              |
| US-05-03 | AC-4, AC-15        | partial  | AC-15 vế _chưa xếp phòng_: `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-request-submission-and-routing`, `g5-delegated-requests`, `g5-group-requests`                                                                                                                                                                                                        |
| US-05-11 | AC-6, AC-10        | partial  | AC còn lại: `g5-step-reassignment-and-controlled-wait`                                                                                                                                                                                                                                                                                                                    |
| US-05-12 | AC-3, AC-10, AC-11 | partial  | AC còn lại: `g5-step-reassignment-and-controlled-wait`                                                                                                                                                                                                                                                                                                                    |
| US-05-13 | AC-11              | partial  | AC còn lại: `g5-return-and-renewal-requests`                                                                                                                                                                                                                                                                                                                              |
| US-05-14 | AC-6               | partial  | AC còn lại: `g5-return-and-renewal-requests`                                                                                                                                                                                                                                                                                                                              |
| US-05-17 | AC-18              | partial  | AC-18 vế _chưa xếp phòng_ (lý do dòng `UNPLACED`): `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-group-requests`, `g5-commitment-lifecycle`                                                                                                                                                                                                                   |
| US-05-20 | AC-12              | partial  | AC còn lại: `g5-internal-software-path`, `g5-internal-software-registration`                                                                                                                                                                                                                                                                                              |
| US-05-21 | AC-8               | partial  | AC-8 vế _chưa xếp phòng_: `qd93-unplaced-employee-first-placement`; AC còn lại: `g5-service-account-request`                                                                                                                                                                                                                                                              |
| US-06-01 | AC-22              | partial  | AC còn lại: `g5-spend-approval-decision`, `g5-group-requests`                                                                                                                                                                                                                                                                                                             |
| US-06-11 | AC-12              | partial  | AC-11 (đính kèm, `QĐ-93j`): `qd93-budget-record-attachments`; AC còn lại: `g5-budget-version-decision`                                                                                                                                                                                                                                                                    |
| US-06-14 | AC-8, AC-16        | partial  | AC-16 viết lại theo `D-S23` (hồ sơ bổ sung chỉ bỏ người/đổi ngày, không có đường thêm): lát này phủ cả AC-16 bằng hồi quy _không có đường thêm_ cho mọi người không hợp lệ (thân có khóa thêm người ⟹ 422 `VALIDATION_ERROR`; `qd93-unplaced-employee-first-placement` bỏ claim); AC còn lại: `g5-spend-submission-batches`, `g5-group-requests`, `g5-request-withdrawal` |
| US-11-02 | AC-23              | partial  | AC còn lại: `a06-renewal-proposal-decision`, `a06-renewal-open-inputs`, `a06-renewal-usage-evidence`                                                                                                                                                                                                                                                                      |
| US-12-15 | AC-25              | partial  | AC còn lại: `g5-budget-proposal-and-review`, `a02-my-software-read-model`, `a10-manager-dashboard`, `a10-it-admin-dashboard`, `a10-super-admin-dashboard`                                                                                                                                                                                                                 |

AC ghi `partial` vì vế _nhân viên chưa xếp phòng_ (`QĐ-93g`(4)) cần trạng thái chưa tồn tại ở BE `1a77ffe8`; vế Người duyệt
chi của chúng làm đủ ở đây. `US-05-21` AC-8 vế _IT Admin chỉ định người chịu trách nhiệm mới_ là đường cấp phát
`POST /provisioning-tasks` (`responsibleEmployeeId`) — không phải `POST /license-assignments/{id}/responsible-changes`.

## Supporting references

- `US-01-03` AC-1, AC-3, AC-9 và `US-05-10` AC-5, `US-05-12` AC-4 (xác định lại khi đổi người giữ vai — nguồn sự kiện ở
  `qd93-direct-manager-spending-approver-roles`); `US-05-03` AC-9, AC-13, `US-06-01` AC-7, AC-8, AC-19, `US-05-11` AC-1, AC-8
  (đổi chữ, hành vi giữ — chạy lại làm hồi quy); `US-03-06` AC-10, AC-11 (vế (e) bước nhu cầu chờ — kiểm qua `US-05-12` AC-11);
  `US-03-04` AC-8, AC-19, AC-27; `US-06-08` `RETIRED` (11 AC, `QĐ-93d`).
- `QĐ-62c` (hạn không đặt lại), `QĐ-66k` (chưa có Người duyệt chi ⟹ chờ), `QĐ-83a` (giải phóng phần chưa chi), `QĐ-82m`
  `INF-10` (bị thay), `SoD-7`, `SoD-8`.
- Owner 01/11/2026 (`D-S20`, `D-S21`, `D-S22`, `D-S23`, `D-S25`, `D-S26`) — xem header.
- [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md) (tầng module: `identity-access` T2 là tầng thấp nhất
  vừa thấy grant vừa được đọc `organization`, và cả `licensing` T4 lẫn `requests` T5 import được);
  [lệnh vận hành](../../../rules/operational-commands.md); [API contract](../../../rules/api-contract.md) (`OPENAPI-EXAMPLE.1`,
  một mã một status).

## Explicit out of scope

- Vai `MANAGER`/`SPENDING_APPROVER` gán trực tiếp, ràng buộc khi gán, migration chuyển người giữ vai sang grant →
  `qd93-direct-manager-spending-approver-roles` (đi trước, cùng bản phát hành).
- Vế _nhân viên chưa xếp phòng_ của mọi AC trộn; `US-05-02` AC-14; vị từ `unplacedAmong` (`D-S25`) và nhánh `UNPLACED` của
  policy chung → `qd93-unplaced-employee-first-placement`.
- Cảnh báo chủ động _phòng thiếu trưởng phòng_ (dòng 9 của `US-12-15`) — yêu cầu riêng, chưa implement (`D-S20`).
- Đường _thêm người thụ hưởng_ cho hồ sơ bổ sung — không tồn tại và không xây (`D-S23`).
- `POST /license-assignments/{id}/responsible-changes` (đổi người chịu trách nhiệm **Assignment** tài khoản dịch vụ đã có): câu
  hỏi mở `QĐ-93` chờ Owner ở Open questions của Story người chịu trách nhiệm tài khoản dịch vụ (Docs
  `BE-UserStory/src/EP-03.md` dòng 399) — không chặn ở đây.
- Danh mục phần mềm xin được (`GET /requestable-plans`) — không phải route tạo Request; preview là nơi nêu lý do (`US-05-01` AC-16).
- Hợp thức hóa (`US-13-06` AC-22) và đối soát `US-13-05` — G9 chưa có trong BE; quy tắc _chỉ Người duyệt chi_ ghi lại để G9
  dùng.
- Đính kèm tài liệu phiên bản (`US-06-11` AC-11, `QĐ-93j`) → `qd93-budget-record-attachments`; `hrBasis`; dự án.
- Sinh lại tài liệu API cho FE ở Docs — hạng mục sau (W5); spec chỉ liệt kê thay đổi contract.

## Dependencies and blockers

- **Thứ tự merge (đợt sửa sau audit, Owner 01/11/2026):** W3 — hạng mục này **Phase A** merge sau khi
  `qd93-direct-manager-spending-approver-roles` (W2) và `qd93-remove-department-projects` **phase 1** (W2) đã `merged-dev`, rebase
  trên `dev` trước khi merge, và **ship cùng bản phát hành** với roles (giữa hai bản, route `/approval-roles` cũ vẫn ghi hai vai);
  sau đó `qd93-unplaced-employee-first-placement` A–D (thêm nhánh `UNPLACED`); W4 `qd93-budget-record-attachments`,
  `dashboard-request-queues-wiring` đi sau Phase A; W5 — chạy lệnh chuyển đổi ở mỗi môi trường, rồi **Phase B** (gỡ bảng) là bản
  phát hành riêng (cùng đợt `qd93-remove-department-projects` phase 2, cũng riêng), rồi sinh lại tài liệu FE.
- Dùng từ roles (đã merge): grant `SPENDING_APPROVER`, `IdentityAccessApi.lockSpendingApproverAmong(tx, employeeIds)`,
  `getApprovalRoleHolders()` đọc grant cho vế Người duyệt chi, trưởng phòng giữ `MANAGER`, `ApprovalRoleChange` phát khi gán/thu
  hồi grant.
- Migration Phase A là task đầu; migration Phase B chỉ chạy sau khi `pnpm ops:approval-role-conversion` đã chạy xong ở môi
  trường đó và `pnpm ops:preflight` không còn dòng chặn.
- Thứ tự triển khai Phase A (H2): xem _Bước cũ đóng băng tới khi chuyển đổi_ — lệnh chuyển đổi chạy **sau** khi API/worker mới
  đã lên, không chạy giữa `migrate deploy` và lúc khởi động (API cũ vẫn phục vụ trong lúc migrate, `scripts/ops/deploy-release.sh`).
- OD-1 → OD-7 đã được Owner duyệt 01/11/2026; OD-4 chốt theo `QĐ-93d`(1) `D-S16`; OD-2 thay bởi `D-S21`; cảnh báo của bước nhu
  cầu chờ `NO_DEPARTMENT_HEAD` chốt theo `D-S20` (không còn pre-check). Không còn chặn `ready` từ phía OD (review toàn spec còn chờ).

## Ownership: module, data, API

| Module / capability                                                                                                                                                                                                                                                                                                                                                              | Đọc                                                                                                                                                                                                                                        | Ghi                                                                              | Thay đổi                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-access/request-party/` (mới: `request-party-eligibility.service.ts`, `request-party.policy.ts` + spec — policy thuần **nội bộ**, một người dùng) + `public/request-party-eligibility.api.ts`, `public/request-party.{types,errors}.ts` (mới)                                                                                                                           | grant `SPENDING_APPROVER` qua service `accounts/` đứng sau `lockSpendingApproverAmong`/`getSpendingApproverEmployeeId` (không qua `IdentityAccessApi`); vế `UNPLACED` qua `OrganizationReadApi.getUnplacedEmployeeIds` (hạng mục unplaced) | —                                                                                | hợp đồng chung `D-S21` — hạng mục này sở hữu                                                                                                                                                                                                                                                                        |
| `identity-access/approval-roles/*`, `accounts/{account.types.ts,successor-eligibility.service.ts}`, `access/jwt-access-token-verifier.service.ts`, `identity-access{,-facade,-inspection-facade,-recovery-cli}.module.ts`, `public/{identity-access.api.ts,identity-access.types.ts,identity-access-inspection.api.ts,identity-access.extension-points.ts}`                      | grant                                                                                                                                                                                                                                      | Phase B gỡ `approval_role_holders`                                               | gỡ controller/service/repo ghi/DTO/lỗi/`approval-role-reader.repo.ts`; `ApprovalRoleFactsService`/`APPROVAL_ROLE_HOLDINGS` chỉ đọc grant; facade `getSpendingApproverEmployeeId(tx?, { forShare? })`, `everHeldSpendingApproverAmong(tx, ids)` (Phase A, luật bước chi cũ; `accounts/role-grant.{service,repo}.ts`) |
| `requests/access-request` (`routing.policy.ts`, `routing-facts.service.ts`, `need-decision.policy.ts`, `request-facts.service.ts`, `access-request.dto.ts`, `access-request.types.ts`, `access-request-audit-event.mapper.ts`, `access-request.http-errors.ts`)                                                                                                                  | trưởng phòng, người giữ vai qua facade                                                                                                                                                                                                     | `access_request_steps`                                                           | bỏ dòng 3; dòng 4 ⟹ chờ `NO_DEPARTMENT_HEAD`; map lỗi chung; audit `OPERATOR` tùy chọn                                                                                                                                                                                                                              |
| `requests` đường tạo: `request-intake`, `assessment/proposal.service.ts`, `service-account-request`, `renewal-request`, `draft`, `delegated-request`, `group-request-submission/*`, `return-request`, `request-submission` (preview)                                                                                                                                             | như trên                                                                                                                                                                                                                                   | không đổi bảng                                                                   | gọi policy chung; `GET /group-request-candidates` loại người không hợp lệ                                                                                                                                                                                                                                           |
| `requests/step-routing` (`spend-routing.policy.ts`, `step-target.service.ts`, `reassignment.policy.ts`, `step-reassignment.repo.ts`), `requests/reassignment/*`                                                                                                                                                                                                                  | người giữ vai                                                                                                                                                                                                                              | `access_request_steps`, `controlled_wait_alerts`, `audit_events`                 | `REWAIT`, đóng băng bước cũ, trigger `QD93_CONVERSION`; lý do/gợi ý/người nhận cảnh báo                                                                                                                                                                                                                             |
| `requests/spend*` (`spend-submission.policy.ts`, `spend-entry.service.ts`, `spend-routing.service.ts`, `spend-decision.policy.ts`, `spend-decision.repo.ts`, `spend-approval/*`, `spend-approval-view/*`, `spend-submission/spend-batch.service.ts`)                                                                                                                             | grant (`FOR SHARE` khi giao bước chi)                                                                                                                                                                                                      | `access_request_steps`, `approval_records`, `spend_batch_items`                  | bỏ `DIRECT` cho phòng thiếu trưởng phòng; bỏ `CONFLICT_SUBSTITUTE`; từ chối bước đóng băng                                                                                                                                                                                                                          |
| `requests` người tiêu dùng khác: `need-decision/*`, `need-decision-queue/*`, `group-line-decisions/{group-need-decision,group-spend-record}.service.ts`, `group-request/{line-decision.repo.ts,group-request.dto.ts,group-resolution.policy.ts,group-request.policy.ts}`, `assessment/assessment-query.service.ts`, `budget-information/*`, `sla/sla-recipient-facts.service.ts` | người giữ vai                                                                                                                                                                                                                              | —                                                                                | đổi kiểu `DeciderRole`, facade, `LineReason`; bước đóng băng                                                                                                                                                                                                                                                        |
| `requests/approval-role-conversion/` (mới) + `src/cli/approval-role-conversion/` (mới)                                                                                                                                                                                                                                                                                           | Request mở, bước, grant, phiên bản, gia hạn, `return_requests`                                                                                                                                                                             | `access_requests`, dòng nhóm, bước, cam kết (qua `BudgetsApi`), audit, thông báo | lệnh vận hành `pnpm ops:approval-role-conversion` (Owner duyệt 01/11/2026)                                                                                                                                                                                                                                          |
| `budgets/budget`, `budgets/version`                                                                                                                                                                                                                                                                                                                                              | grant (`FOR SHARE` khi gửi)                                                                                                                                                                                                                | `budget_version_decisions`; thông báo qua `NotificationsApi`                     | người quyết luôn là Người duyệt chi; `waitingReason`; báo Super Admin dòng 27 (`D-S16`); listener `ApprovalRoleChange` + `OrganizationChange` `EMPLOYEE_LEFT`                                                                                                                                                       |
| `licensing/subscription-renewal`                                                                                                                                                                                                                                                                                                                                                 | grant                                                                                                                                                                                                                                      | `subscription_renewals`; thông báo qua `NotificationsApi`                        | như trên; bỏ quyền đọc của người thay thế                                                                                                                                                                                                                                                                           |
| `licensing/provisioning` (`tasks/provisioning-holder.service.ts`, `grant-cancellation/*`, `provisioning.http-errors.ts`), `licensing/assignment/assignment.service.ts`, `public/{licensing.api.ts,licensing-open-grants.types.ts}`                                                                                                                                               | grant qua policy chung                                                                                                                                                                                                                     | `provisioning_tasks`, `license_assignments` (như hiện hành)                      | từ chối người chịu trách nhiệm mới là Người duyệt chi; nguyên nhân hủy `SPENDING_APPROVER_PARTY`; `operator?` cho audit                                                                                                                                                                                             |
| `notifications/inbox` (`inbox.policy.ts`)                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                          | —                                                                                | `CONTROLLED_WAIT_ALERT` nhận thêm khóa tham số của phiên bản/gia hạn; không mã mới                                                                                                                                                                                                                                  |
| `personnel/role-duties`                                                                                                                                                                                                                                                                                                                                                          | người giữ vai                                                                                                                                                                                                                              | `offboarding_cases.role_flags`                                                   | không còn ghi `SUBSTITUTE_APPROVER`, `FALLBACK_APPROVER`                                                                                                                                                                                                                                                            |
| `dashboards/super-admin`, `installation` inspection, `cli/inspect`, `cli/demo-dataset` (`fixture/*`, `steps/{organization,finance,request}.steps.ts`)                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                          | —                                                                                | bỏ link `approvalRoleList`, số đếm hai vai, bước demo hai vai                                                                                                                                                                                                                                                       |
| `installation/migration-preflight`, `installation/public/recovery-target.policy.ts`, `Dockerfile` (nhãn `data-reads`)                                                                                                                                                                                                                                                            | như lệnh chuyển đổi                                                                                                                                                                                                                        | —                                                                                | ba dòng chặn Phase B; hai dạng dữ liệu mới (M5)                                                                                                                                                                                                                                                                     |

## Behavior and design

### Định tuyến bước nhu cầu (`routeNeedStep`)

| Tình huống                                            | Trước (BE `1a77ffe8`)                                                    | Sau                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| phòng có trưởng phòng ≠ người yêu cầu (dòng 1)        | giao trưởng phòng (`MANAGER`)                                            | giữ                                                                                                                     |
| trưởng phòng tự gửi, có Người duyệt chi (dòng 2)      | giao Người duyệt chi                                                     | giữ                                                                                                                     |
| trưởng phòng tự gửi, chưa có Người duyệt chi (dòng 8) | chờ `NO_SPENDING_APPROVER`                                               | giữ                                                                                                                     |
| trưởng phòng chính là Người duyệt chi (dòng 3)        | approver dự phòng                                                        | **bỏ** — không xảy ra (`QĐ-93b`); nếu dữ liệu cũ còn ⟹ coi như dòng 2 không có người hợp lệ: chờ `NO_SPENDING_APPROVER` |
| phòng chưa có trưởng phòng (dòng 4)                   | approver dự phòng / chờ `NO_FALLBACK_APPROVER` / `FALLBACK_IS_REQUESTER` | chờ `NO_DEPARTMENT_HEAD`, không giao ai                                                                                 |

```ts
export type RoutedRole = 'MANAGER' | 'SPENDING_APPROVER';
export type WaitingReason = 'NO_SPENDING_APPROVER' | 'NO_DEPARTMENT_HEAD';
export type RoutingDecision =
  | { outcome: 'ASSIGNED'; row: 1 | 2; assigneeEmployeeId: string; role: RoutedRole; samePersonAsSpend: boolean }
  | { outcome: 'WAITING'; row: 4 | 8; reason: WaitingReason };
export function routeNeedStep(facts: RoutingFacts): RoutingDecision; // RoutingFacts bỏ fallbackApproverEmployeeId
```

- `routing_row` của bước chờ phòng thiếu trưởng phòng là 4 (OD-1; ràng buộc `BETWEEN 1 AND 9` giữ). Bước **đang chờ** ở dòng 4
  là hợp lệ vĩnh viễn; chỉ bước nhu cầu **`PENDING`** ở dòng 3/4 là dữ liệu cũ (approver dự phòng giữ): `routeNeedStep` chỉ giao
  dòng 1|2, `repo.assign` ghi lại `routing_row` mỗi lần giao (dòng 1/2), `repo.wait`/`rewait` không đổi `routing_row` — nên guard
  Phase B lọc theo `state` (xem _Migration_), không bao giờ vấp bước chờ mới.
- `deciderRoleOf(routingRow): DeciderRole | null` — Phase A trả `null` cho 3/4 (bước cũ đóng băng ⟹ từ chối quyết, mục dưới);
  `DeciderRole = 'MANAGER' | 'SPENDING_APPROVER'` cho ghi mới. Phase B bỏ nhánh `null` (3/4 lại rơi vào `throw` như dòng 8).
- Dòng nhóm (`group-need-routing.policy.ts`): bỏ `FALLBACK_IS_REQUESTER`; dòng của người thuộc phòng thiếu trưởng phòng ⟹ bước
  nhu cầu chờ `NO_DEPARTMENT_HEAD`.
- Bước chờ được giao khi có trưởng phòng: cơ chế hiện có — `OrganizationChangeListeners` `HEAD_PERIOD_START` (gán hôm nay,
  hoặc `OrganizationChangeSweeper` báo đúng ngày của giai đoạn tương lai) và sweep `WAITING_RETRY`/`EFFECTIVE_DATE_REACHED`
  của worker; `decideReassignment` giao ngay khi có đích, `created_at` của bước giữ ⟹ tuổi SLA không đặt lại (`QĐ-62c`).
  Không job mới.
- Bản xem trước (`request-preview.policy.ts`, `request-preview.dto.ts`): dòng 4 giải thích `WAITS_FOR_DEPARTMENT_HEAD` (thay
  `DEPARTMENT_HAS_NO_HEAD`); `role` bỏ `FALLBACK_APPROVER`; `waitingReason` = `NO_SPENDING_APPROVER | NO_DEPARTMENT_HEAD`.

### Bước chi (`routeSpendStep`) và bỏ đi thẳng (`INF-10`)

```ts
export type WaitingSpendReason = 'NO_SPENDING_APPROVER' | 'SPENDING_APPROVER_IS_PARTY';
export type SpendAssignment =
  { outcome: 'ASSIGNED'; assigneeEmployeeId: string } | { outcome: 'WAITING'; reason: WaitingSpendReason };
export function routeSpendStep(people: RequestPeople, spendingApproverEmployeeId: string | null): SpendAssignment;
```

- `SPENDING_APPROVER_IS_PARTY` là lý do **chuyển tiếp**: chỉ Request cũ (tạo trước Phase A) có Người duyệt chi là bên mới gặp;
  không bao giờ giao Người duyệt chi cho Request mà người đó là bên (`SoD-7`); lệnh chuyển đổi đóng các Request đó; Phase B
  bỏ giá trị này.
- `entryFor` (`spend-submission.policy.ts`): người quyết nhu cầu `MANAGER` ⟹ `HEAD_QUEUE`; `SPENDING_APPROVER` (dòng 2,
  trưởng phòng tự gửi) ⟹ giữ `DIRECT` như hiện hành (không phải `INF-10`); không còn `FALLBACK_APPROVER`. Phòng thiếu trưởng
  phòng không bao giờ tới bước này vì bước nhu cầu chờ. Request đã được trưởng phòng cũ xác nhận và đang trong hàng đợi trình
  khi trưởng phòng rời đi **ở lại hàng đợi** của phòng, không đi thẳng (`US-06-14` AC-8) — task kiểm và gỡ mọi nhánh hiện có
  chuyển hàng đợi sang `DIRECT` khi mất trưởng phòng.
- Bước chi `DIRECT` đã tạo trước chuyển đổi (`QĐ-93k`(3)) giữ nguyên, không đụng.
- Bỏ `substituted`, `conflictOfInterest` khỏi kết quả định tuyến và audit `ACCESS_REQUEST.BUDGET_CHECKED`; không ghi
  `SpendBatchLeftReason.CONFLICT_OF_INTEREST` mới.
- **Đua thu hồi vai ↔ giao bước chi (M6).** Đọc người giữ vai không khóa + listener `ApprovalRoleChange` chạy một lần + sweep
  ngày chỉ duyệt bước nhu cầu ⟹ bước chi có thể được giao cho người vừa bị thu hồi. Sửa: mọi transaction mở/giao bước chi
  (`spend-routing.service.ts`, `spend-entry.service.ts`, `group-spend-record.service.ts` khi mở lại) gọi
  `IdentityAccessApi.getSpendingApproverEmployeeId(tx, { forShare: true })` **trước** khi khóa Request:
  `SELECT … FROM role_grants WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL … FOR SHARE` — đúng dòng mà lệnh thu hồi
  `UPDATE` (`revoked_at`), nên hai phía tuần tự (thứ tự khóa grant → Request ở cả hai phía; lệnh thu hồi khóa `app_users` → grant
  → Request qua listener). Thu hồi commit trước ⟹ phía giao đọc lại không còn người giữ ⟹ chờ `NO_SPENDING_APPROVER`; giao
  commit trước ⟹ listener của lệnh thu hồi thấy bước và đưa vào chờ. Gán người mới song song (INSERT grant) có thể để bước chờ
  một nhịp — sweep `WAITING_RETRY` giao lại (hồi quy có test).

### Lý do chờ, gợi ý, người nhận cảnh báo (`D-S20`)

- `WAITING_REASON_CODES` (Phase A): `NO_SPENDING_APPROVER`, `NO_DEPARTMENT_HEAD`, `SPENDING_APPROVER_IS_PARTY`,
  `NO_FINANCE_REVIEWER`, `NO_IT_ADMIN_IN_CHARGE` + ba giá trị cũ `NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`,
  `NO_CONFLICT_SUBSTITUTE` giữ **chỉ để đọc** tới khi lệnh chuyển đổi xác định lại hết (Phase B bỏ cả ba và
  `SPENDING_APPROVER_IS_PARTY`). Cột `waiting_reason` là TEXT, không cần migration.
- `ConfigurationHint`: `NO_DEPARTMENT_HEAD` ⟹ `ASSIGN_DEPARTMENT_HEAD`; `NO_SPENDING_APPROVER` và `SPENDING_APPROVER_IS_PARTY` ⟹
  `CONFIGURE_SPENDING_APPROVER` (giữ mã, mô tả đổi thành "gán vai `SPENDING_APPROVER`"); Phase A không còn sinh
  `CONFIGURE_FALLBACK_APPROVER`, `CONFIGURE_CONFLICT_SUBSTITUTE` (giữ trong enum đọc, Phase B bỏ).
- `alertRecipientsOf(kind, reason)` luôn trả `['SUPER_ADMIN']` (bỏ nhánh `IT_ADMIN_IN_CHARGE` của `NO_FALLBACK_APPROVER`; không
  còn nhánh rỗng nào nên `controlled_wait_alerts` không có hàng thiếu người nhận). `NEED` + `NO_DEPARTMENT_HEAD` ⟹ Super Admin
  nhận **cảnh báo controlled-wait sẵn có** (`ACCESS_REQUEST.STEP_WAIT_ALERTED` → `CONTROLLED_WAIT_ALERT`, gợi ý
  `ASSIGN_DEPARTMENT_HEAD`) cùng cảnh báo đọc `MISSING_HEAD` hiện có — `D-S20`, `US-05-11` AC-6, `US-12-15` AC-25; không loại
  thông báo mới. Bước chi chờ `NO_SPENDING_APPROVER` ⟹ Super Admin (dòng 27, như hiện hành); phiên bản ngân sách và mục gia hạn
  chờ ⟹ Super Admin qua **cùng** cảnh báo (`D-S16`, mục _Quyết định phiên bản ngân sách và gia hạn_); không ai nhận với tư cách
  approver dự phòng/người thay thế.

### Xác định lại và chờ lại (`decideReassignment`, B1)

```ts
export const REASSIGNMENT_TRIGGERS = [/* sáu giá trị hiện có */ 'QD93_CONVERSION'] as const; // SweepTrigger không có nó
export interface OpenStep {
  /* như cũ */ waitingReason: string | null;
  legacy: boolean;
}
export type ReassignmentDecision =
  | { action: 'KEEP' }
  | { action: 'ASSIGN'; assigneeEmployeeId: string; routingRow: number | null }
  | { action: 'WAIT'; reason: WaitingReasonCode }
  | { action: 'REWAIT'; reason: WaitingReasonCode }; // mới
/**
 * Bước của luật cũ: NEED PENDING dòng 3/4; WAITING với lý do cũ; SPEND_APPROVAL PENDING mà người giữ **chưa từng** có dòng
 * `role_grants` `SPENDING_APPROVER` (kể cả dòng đã thu hồi) — tức bước giao người thay thế khi xung đột.
 * `spendingApproverGrantees` = người giữ bước chi trong lượt mà `everHeldSpendingApproverAmong` trả về.
 */
export function isLegacyStep(step: ReassignableStep, spendingApproverGrantees: ReadonlySet<string>): boolean;
```

**Luật bước chi cũ (review vòng 2, B).** Không so người giữ bước với người giữ grant _hiện tại_: listener `ApprovalRoleChange`
chạy trong transaction của lệnh thu hồi/chuyển, **sau** `UPDATE revoked_at` (`role-grant.service.ts` phát sự kiện sau khi ghi),
nên mọi bước chi của người vừa bị thu hồi sẽ bị coi là cũ, đứng yên, không bao giờ chờ/giao lại và quyết bị 409 — phá `US-01-03`
AC-3, `US-05-11` AC-10, M6 và làm guard Phase B (iii) chặn mãi. Dữ kiện dùng thay là **lịch sử grant**, cố định với mọi bước
cũ và không đổi khi đổi người giữ vai; đúng với schema thật vì:

- thu hồi là `UPDATE role_grants SET revoked_at` (`role-grant.repo.ts` `revokeRole`), không code nào xóa `role_grants` hay
  `app_users` (FK `role_grants_app_user_id_fkey` `ON DELETE RESTRICT`) ⟹ "đã từng giữ" chỉ tăng;
- migration của roles cấp grant cho người giữ `SPENDING_APPROVER` hiện hành (đã có tài khoản — guard (d) của roles), và ở Phase A
  mọi bước chi chỉ giao người giữ grant lúc giao ⟹ bước của Người duyệt chi hiện tại, đã bị thu hồi hay đã nghỉ việc đều **không**
  cũ: listener/sweep `HOLDER_LEFT` xử lý như hiện hành;
- luật cũ chỉ giao người thay thế khi Người duyệt chi là bên và người thay thế không là bên (`spend-routing.policy.ts`), và luật
  #9a của roles cấm người đang giữ `CONFLICT_SUBSTITUTE` nhận grant ⟹ bước người thay thế giữ có người giữ chưa từng có grant ⟹
  cũ. Kể cả bước mà API cũ còn tạo trong cửa sổ `migrate deploy` (không cần ảnh chụp lúc deploy);
- nếu sau Phase A người thay thế cũ được gán `SPENDING_APPROVER` (#9a đã gỡ; #10 vẫn áp), bước họ giữ không còn là cũ — đúng, vì khi
  đó họ là Người duyệt chi hợp lệ và không là bên của Request đó.

Một luật cho bốn chỗ: `OpenStep.legacy` của sweep/listener, 409 `STEP_AWAITING_CONVERSION` của bước chi, chọn bước ở bước 3 của
lệnh chuyển đổi và guard Phase B (iii) (cùng nghĩa bằng SQL `NOT EXISTS` trên `role_grants` ⋈ `app_users`).

Thứ tự quyết định (pure, `reassignment.policy.ts`):

1. `step.legacy` và trigger ≠ `QD93_CONVERSION` ⟹ `KEEP`, không cảnh báo (đóng băng). Không `legacy` và trigger =
   `QD93_CONVERSION` ⟹ `KEEP`. (`touchesHeldStep(step, QD93_CONVERSION) = step.legacy`.)
2. `WAITING`: đích là người ⟹ `ASSIGN`; đích không ai và lý do **khác** `waitingReason` ⟹ `REWAIT`; cùng lý do ⟹ `KEEP`.
3. `PENDING`: trigger không chạm bước ⟹ `KEEP`; đích không ai ⟹ `WAIT`; đích là chính người giữ, người đó còn làm và bước **không**
   `legacy` ⟹ `KEEP`; còn lại ⟹ `ASSIGN` — bước cũ mà bảng vẫn chọn đúng người đang giữ (approver dự phòng nay là trưởng phòng)
   vẫn `ASSIGN` để ghi lại `routing_row` 1/2.

- `REWAIT` ghi `StepReassignmentRepo.rewait(tx, stepId, reason)`: chỉ `UPDATE waiting_reason` — `state` vẫn `WAITING` nên trigger
  `access_request_steps_waiting_since` giữ `waiting_since`, `created_at` và `routing_row` không đổi; audit
  `ACCESS_REQUEST.STEP_WAITING_REASON_CHANGED` (`before.waitingReason` cũ; `after`: `waitingReason`, `trigger`, `source`,
  `stepCreatedAt`); gọi `alert()` như `KEEP` — chỉ phát nếu đoạn chờ này chưa có cảnh báo (unique `(step_id, waiting_since)`),
  vì đoạn chờ không đổi. `ReconcileResult` thêm `rewaited`. `/controlled-waits` đọc lý do mới ⟹ gợi ý mới (hết
  `CONFIGURE_FALLBACK_APPROVER` cho bước đã xác định lại).
- `TodayFacts` **không** thêm người giữ grant. `StepReassignmentService.reconcileRequests`, sau `lockWithOpenSteps`, đọc một lần
  mỗi lượt `IdentityAccessApi.everHeldSpendingApproverAmong(tx, <người giữ các bước chi PENDING đã khóa>)` (mẫu `holdersWhoLeft`;
  `SELECT DISTINCT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SPENDING_APPROVER'
AND u.employee_id = ANY(…)`, không lọc `revoked_at`, không khóa) rồi đặt `OpenStep.legacy = isLegacyStep(…)`. Người vừa bị
  thu hồi hay đã nghỉ việc vẫn có dòng grant ⟹ bước chi của họ **không** `legacy`: listener thu hồi/chuyển giao lại hoặc đưa vào
  chờ, sweep `HOLDER_LEFT` xử lý như hiện hành. Đọc không khóa là đủ: grant mới đồng thời chỉ có thể biến bước cũ thành không cũ
  (người nhận grant là Người duyệt chi hợp lệ), lượt sau đọc lại.
- `reassignmentAuditEvent(…, operator?: OperatorAuditActor)` và `reconcileRequests(…, operator?)`: có `operator` ⟹ sự kiện
  `OPERATOR` (`operatorReference` = tham chiếu duyệt, `correlationId` = mã lượt chạy), dùng cho lệnh chuyển đổi.

### Bước cũ đóng băng tới khi chuyển đổi (H2)

- Từ lúc API/worker Phase A lên tới khi lệnh chuyển đổi chạy, bước `legacy` **đứng yên**: sweep (`WAITING_RETRY`, `HOLDER_LEFT`,
  ngày), listener `OrganizationChange`/`ApprovalRoleChange` không đụng (luật 1 ở trên); chỉ trigger `QD93_CONVERSION` di chuyển
  chúng, nên audit luôn mang nguồn chuyển đổi (`US-05-12` AC-10).
- Quyết định trên bước đóng băng bị từ chối **409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION`** (mã chuyển tiếp, Phase B bỏ):
  `accessRequestNeedDecide`, `accessRequestLineNeedDecide` (bước nhu cầu dòng 3/4 — `deciderRoleOf` trả `null`),
  `spendApprovalDecide`, `spendApprovalLineDecide` (bước chi `legacy` theo _Luật bước chi cũ_: người gọi — người giữ — **chưa
  từng** có dòng grant `SPENDING_APPROVER`, đọc bằng `everHeldSpendingApproverAmong(tx, [người giữ])`; người giữ grant đã bị
  thu hồi không bao giờ gặp mã này vì listener của lệnh thu hồi đã chuyển bước trong cùng transaction); với `spendBatchDecide`
  mục đó bị bỏ qua với `reason: 'STEP_AWAITING_CONVERSION'` (thêm vào enum lý do bỏ qua hiện có). Kiểm sau
  `OWN_REQUEST`/`NOT_THE_ASSIGNEE`, trước `STEP_NOT_PENDING`. Hàng đợi `GET /need-decisions` không trả bước dòng 3/4 (repo lọc ⟹
  mapper không bao giờ gọi `deciderRoleOf(3|4)`).
- Không có đường mới nào tạo dữ liệu cũ: định tuyến chỉ ra dòng 1/2/4/8, bước chi không giao người thay thế.
- **Thứ tự triển khai.** `deploy-release.sh`: preflight → backup → `migrate deploy` → `db-roles reconcile` → dừng worker cũ → API
  mới → worker mới; API cũ vẫn phục vụ suốt lúc migrate nên còn có thể ghi dữ liệu cũ tới khi API mới lên. Vì vậy lệnh chuyển
  đổi chạy **sau** khi bản phát hành đã lên ở môi trường đó (không chèn giữa migrate và khởi động — chỗ đó không đóng được cửa
  sổ): `--dry-run` rồi chạy thật ngay sau deploy (runbook `docs/guides/containers.md`), ghi kết quả vào bảng verification. Chạy lại
  được bất cứ lúc nào (idempotent).

### Hợp đồng từ chối bên của Request (`D-S21`, hạng mục này sở hữu)

Một hợp đồng cho mọi route tạo/xem trước/nháp/kiểm nhóm/tạo thay/gia hạn/hoàn trả/tài khoản dịch vụ và đường IT Admin đổi người
chịu trách nhiệm; `qd93-unplaced-employee-first-placement` chỉ thêm nhánh `UNPLACED` vào **cùng** policy và facade.

```ts
// identity-access/public/request-party.types.ts
export type RequestPartyReason = 'SPENDING_APPROVER' | 'UNPLACED';
export type RequestPartyRole = 'REQUESTER' | 'BENEFICIARY';
export interface RequestParties { requesterEmployeeId: string | null; beneficiaryEmployeeIds: readonly string[] }
export interface RequestPartyBlock { reason: RequestPartyReason; party: RequestPartyRole; employeeIds: string[] }

// identity-access/request-party/request-party.policy.ts (thuần, NỘI BỘ capability — chỉ request-party-eligibility.service.ts
// import; không module nào khác cần nên không nằm ở public/ và không vào PUBLIC_ROOT_POLICY_FILES — module-structure.md BEH.1)
export interface RequestPartyFacts { spendingApproverEmployeeId: string | null; unplacedEmployeeIds: ReadonlySet<string> }
export function requestPartyBlock(parties: RequestParties, facts: RequestPartyFacts): RequestPartyBlock | null;
/** Lý do của từng người không hợp lệ; một người là cả hai ⟹ SPENDING_APPROVER. */
export function ineligibleReasons(
  employeeIds: readonly string[],
  facts: RequestPartyFacts,
): ReadonlyMap<string, RequestPartyReason>;

// identity-access/public/request-party.errors.ts
export const REQUEST_PARTY_INELIGIBLE = 'REQUEST_PARTY.INELIGIBLE';
export class RequestPartyIneligibleError extends Error { constructor(readonly block: RequestPartyBlock) }
/** Thân lỗi viết một lần; mỗi `*.http-errors.ts` bọc: `new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, requestPartyRefusalBody(e))`. */
export function requestPartyRefusalBody(error: RequestPartyIneligibleError): {
  code: typeof REQUEST_PARTY_INELIGIBLE; message: string; details: RequestPartyBlock;
};

// identity-access/public/request-party-eligibility.api.ts
export class RequestPartyEligibilityApi {
  /** Khóa FOR SHARE tài khoản các bên theo thứ tự id, rồi đọc người chưa xếp phòng; ném RequestPartyIneligibleError. */
  assertEligible(tx: DbTx, parties: RequestParties): Promise<void>;
  /** Cùng phán định, không khóa, không ném: preview, /group-requests/check, người gọi groupRequestCandidateList. */
  blockOf(parties: RequestParties, tx?: DbTx): Promise<RequestPartyBlock | null>;
  /**
   * Lý do của từng người không bao giờ là bên: khóa của Map cho danh sách chọn, giá trị cho lý do dòng nhóm.
   * `lockForShare` (cần `tx`) khóa như assertEligible — dùng cho dòng của groupRequestSubmit.
   */
  ineligibleAmong(
    employeeIds: readonly string[],
    tx?: DbTx,
    options?: { lockForShare?: boolean },
  ): Promise<ReadonlyMap<string, RequestPartyReason>>;
}
```

`RequestPartyEligibilityService` (`identity-access/request-party/`) là lớp mà facade gọi; nó tiêm **service** `accounts/` đứng sau
`IdentityAccessApi.lockSpendingApproverAmong` và `getSpendingApproverEmployeeId` (dự kiến `accounts/role-grant.service.ts`; đọc
chỗ roles đặt `lockSpendingApproverAmong` trên `dev`) và `OrganizationReadApi` — **không** import `IdentityAccessApi`
(capability không import facade của chính module, `module-structure.md` R6, gate `module-layout`).

**Một trình tự cho mọi đường (chốt chung với `qd93-unplaced-employee-first-placement`):**

1. Khóa (chỉ `assertEligible`, `ineligibleAmong(…, { lockForShare: true })`): `lockSpendingApproverAmong(tx, mọi id các bên)` —
   khóa `FOR SHARE` tài khoản theo thứ tự id, trả người giữ grant trong tập. Kiểm **không** khóa dòng nhân viên nào. Theo từng
   người, thứ tự khóa luôn là nhân viên → tài khoản (như lệnh gán vai và ghi nghỉ việc): route nào khóa nhân viên của một bên thì
   khóa **trước** khi gọi kiểm (mục _Vị trí_ dưới), không bao giờ sau.
2. Đọc người chưa xếp phòng: `OrganizationReadApi.getUnplacedEmployeeIds(mọi id các bên, tx)` (`D-S25`, hạng mục unplaced sở hữu,
   dựa trên `EmployeeRepo.unplacedAmong`; chỉ trả nhân viên tồn tại). Đọc **sau** bước 1 nên (READ COMMITTED) thấy mọi thay đổi
   đã commit của bên vừa giữ khóa tài khoản `FOR UPDATE`. Tới khi hạng mục unplaced merge, tập này rỗng và bước 2 không có.
3. Phán định thuần (`requestPartyBlock` / `ineligibleReasons`) trên hai dữ kiện; `blockOf` và `ineligibleAmong` không khóa dùng
   `getSpendingApproverEmployeeId(tx?)` thay bước 1.

- **HTTP 422, một mã `REQUEST_PARTY.INELIGIBLE` cho mọi route** (một mã một status — API contract); `message` cố định:
  _"The spending approver and an employee who is not placed in a department cannot ask for or be given access through a
  request."_; `details: { reason, party, employeeIds }`, không trường nào khác.
- **Thứ tự phán định:** bên `REQUESTER` trước `BENEFICIARY`; trong một bên `SPENDING_APPROVER` trước `UNPLACED`; một người là cả hai
  ⟹ `SPENDING_APPROVER`. `employeeIds` = mọi người của Request có **cùng** cặp (bên, lý do) đó, không trùng, sắp tăng dần, ít nhất
  một — `reason` đúng cho từng id liệt kê. Request tự xin (người yêu cầu = người thụ hưởng) ⟹ `party: 'REQUESTER'`. Người chịu
  trách nhiệm tài khoản dịch vụ là người thụ hưởng của Request đó (`service-account-request.service.ts` ghi
  `beneficiaryEmployeeIds: [người chịu trách nhiệm]`) ⟹ `party: 'BENEFICIARY'` khi IT Admin chỉ định người khác.
- Hạng mục unplaced chỉ cắm bước 2 (`OrganizationReadApi.getUnplacedEmployeeIds`, cạnh `identity-access → organization` cho phép
  ở T2) và nhánh `UNPLACED` của hai hàm thuần; **không** thêm khóa nhân viên, không đổi tên phương thức, vị trí gọi hay thứ tự.
- **Vị trí trong mỗi route:** ngay sau khóa nhân viên hiện có của route (người gửi `lockEmployeeForShare`; tạo thay: mọi người thụ
  hưởng; cấp phát: người chịu trách nhiệm) và **trước mọi đọc phòng/Cost Center của bất kỳ bên nào** (`assess`/`assessProposal`,
  `getOwningUnits`/`getRequestUnits`, `headedDepartment` của tạo thay, `problemWith` của cấp phát) ⟹ `ACCESS_REQUEST.NO_DEPARTMENT`,
  `RETURN_REQUEST.NO_DEPARTMENT`, `DELEGATED_REQUEST.NOT_HEAD`/`OUTSIDE_DEPARTMENT`, `RENEWAL_REQUEST.OUTSIDE_DEPARTMENT`,
  `PROVISIONING.RESPONSIBLE_INVALID` (`OUTSIDE_DEPARTMENT`) không bao giờ ra trước cho một bên không hợp lệ. Lỗi không dựa vào
  phòng đứng trước giữ chỗ (`ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`, nháp không thuộc người gọi, id nhân viên không tồn tại).
  Route không khóa nhân viên (gia hạn, hoàn trả) gọi kiểm ở đầu transaction.
- **Preview** (`accessRequestPreview`): `blockOf` chạy **trước** `assess`; 200, thêm
  `blockedBy: { reason, party, employeeIds } | null` (cùng hình, cùng thứ tự); `blockedBy ≠ null` ⟹ `canSubmit: false`. Người duyệt chi có phòng ⟹ phần còn lại tính như
  thường. Thay `SPENDING_APPROVER_NO_REQUESTS` của bản trước. (Hình bản xem trước khi người yêu cầu _chưa xếp phòng_ — không có
  phòng để tính — do hạng mục unplaced định.)
- **Nhóm:** người gửi không hợp lệ ⟹ 422 chung (cả `/check` — `blockOf` — và gửi — `assertEligible`, sau `requireSender`, trước
  đọc phòng); dòng thụ hưởng ⟹ `ineligibleAmong` (gửi: `lockForShare: true`, **sau** khi bước gom dữ kiện đã khóa nhân viên của
  dòng — nhân viên → tài khoản; `/check`: không khóa) ⟹ `LineReason` thêm `'SPENDING_APPROVER'` (hạng mục unplaced thêm
  `'UNPLACED'`), đứng **đầu** thứ tự lý do của dòng (policy thuần quyết thứ tự, nên đọc phòng của dòng trước đó không làm lý do
  phòng ra trước), trong `GROUP_REQUEST.LINES_REFUSED` (`details.lines[].reason`) và trong `lines[].reason` của
  `groupRequestCheck` (200); dòng khác không đổi.
- **Danh sách chọn:** `groupRequestCandidateList` — người gọi là Người duyệt chi (hoặc, sau hạng mục unplaced, _chưa xếp phòng_)
  ⟹ 422 chung `{ reason, party: 'REQUESTER', employeeIds: [người gọi] }` (`blockOf`, trước `getOwningUnits`; người đó không gửi
  được nhóm nào nên không có danh sách để chọn); ứng viên loại khóa của `ineligibleAmong(…)` **trước** khi cắt trang (lọc trong
  bộ nhớ như hiện hành ⟹ `totalItems` đúng). Đây là danh sách chọn duy nhất ở BE `1a77ffe8` — bộ chọn của tạo thay dùng cùng route
  (cùng tập: người của phòng người gọi, còn làm, có email); `departmentMemberList` là danh sách thành viên phòng, không phải bộ
  chọn, giữ nguyên.

Điểm gọi (mọi đường tạo — survey BE `1a77ffe8`), `assertEligible` trong transaction hiện có, theo _Vị trí_ ở trên, trước mọi insert:

| Route (operation)                                                                                                  | Service                                                                   | Bên kiểm                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /access-requests` (`accessRequestSubmit`, trả phí và `INTERNAL_FREE`)                                        | `request-intake/access-request.service.ts`                                | người yêu cầu (= người thụ hưởng)                                                                                                                                                                                                                                                                                                                              |
| `POST /access-requests/proposals` (`accessRequestPropose`)                                                         | `assessment/proposal.service.ts`                                          | người yêu cầu                                                                                                                                                                                                                                                                                                                                                  |
| `POST /access-requests/service-accounts` (`accessRequestServiceAccountSubmit`)                                     | `service-account-request/service-account-request.service.ts`              | người yêu cầu (= người chịu trách nhiệm)                                                                                                                                                                                                                                                                                                                       |
| `POST /access-requests/renewals` (`accessRequestRenewalSubmit`)                                                    | `renewal-request/renewal-request.service.ts`                              | người yêu cầu, người thụ hưởng                                                                                                                                                                                                                                                                                                                                 |
| `POST /access-requests/drafts` (`accessRequestDraftSave`), `…/drafts/{id}/submission` (`accessRequestDraftSubmit`) | `draft/request-draft.service.ts`, `request-draft-submit.service.ts`       | như loại nháp; nháp `GROUP`: người gửi + **mọi** dòng (OD-3, chặn ngay khi lưu dòng — `US-05-17` AC-18)                                                                                                                                                                                                                                                        |
| `POST /delegated-requests` (`delegatedRequestSend`)                                                                | `delegated-request/delegated-request.service.ts`                          | người gọi (`REQUESTER`) + mọi người thụ hưởng một lần — tất cả hoặc không (`D-S22`): khóa `FOR SHARE` mọi người thụ hưởng theo thứ tự id (dời `lockEmployeeForShare` ra khỏi `requireDelegable`; id không tồn tại ⟹ `OUTSIDE_DEPARTMENT` như hiện hành), rồi `assertEligible`, rồi `headedDepartment` và kiểm từng người (`NOT_HEAD`, `OUTSIDE_DEPARTMENT`, …) |
| `POST /group-requests/check` (`groupRequestCheck`), `POST /group-requests` (`groupRequestSubmit`)                  | `group-request-submission/*`, `group-request/group-request.policy.ts`     | người gửi (422); từng dòng (`LineReason`)                                                                                                                                                                                                                                                                                                                      |
| `GET /group-request-candidates` (`groupRequestCandidateList`)                                                      | `group-request-submission/group-candidate.service.ts`                     | người gọi (`REQUESTER`, `blockOf`, 422) trước `getOwningUnits`; ứng viên lọc theo `ineligibleAmong`                                                                                                                                                                                                                                                            |
| `POST /return-requests` (`returnRequestSubmit`)                                                                    | `return-request/return-request.service.ts`                                | người gửi (`REQUESTER`), người giữ seat (`BENEFICIARY`)                                                                                                                                                                                                                                                                                                        |
| `POST /provisioning-tasks` (`provisioningTaskGrant`) với `responsibleEmployeeId`                                   | `licensing/provisioning/tasks/provisioning-holder.service.ts` (`service`) | người IT Admin chỉ định (`BENEFICIARY`, `requesterEmployeeId: null`), trong `problemWith` **sau** khóa nhân viên (`NOT_FOUND` giữ trước) và **trước** đọc trạng thái/`getOwningUnits` (`OUTSIDE_DEPARTMENT`); người chịu trách nhiệm không đổi                                                                                                                 |
| `POST /access-requests/preview` (`accessRequestPreview`)                                                           | `request-submission/request-preview.service.ts`                           | `blockOf` — 200 với `blockedBy`                                                                                                                                                                                                                                                                                                                                |

- Hồ sơ bổ sung (`US-06-14` AC-16 viết lại theo `D-S23`): chỉ bỏ người/đổi ngày; `supplementBodySchema` là `strictObject` nên khóa
  thêm người ⟹ 422 `VALIDATION_ERROR` — không có gì để chặn theo `D-S21`; chỉ có test hồi quy.
- `DelegationRefusal`/`DELEGATED_REQUEST.*`, `BeneficiaryRefusal`, `RETURN_REQUEST.*`, `PROVISIONING.RESPONSIBLE_INVALID` không
  thêm giá trị nào cho Người duyệt chi. Không Request, bước, cam kết, Assignment hay thông báo nào được tạo khi từ chối.

### Quyết định phiên bản ngân sách và gia hạn (`QĐ-93d`(1))

- `budget.policy.ts` `deciderOf`: người quyết = người giữ `SPENDING_APPROVER` còn làm việc; không còn
  `approverIsParty ⟹ CONFLICT_SUBSTITUTE`. Phiên bản lập từ đề xuất của chính người giữ vai (dữ liệu cũ) ⟹ không ai quyết, từ
  chối 403 `BUDGET.CONFLICT_OF_INTEREST` (giữ mã làm chốt `SoD-8`) — lệnh chuyển đổi liệt kê các phiên bản này (`QĐ-93k`(4)).
- Bản đọc phiên bản _chờ quyết định_ thêm `waitingReason: 'NO_SPENDING_APPROVER' | null` (không phá vỡ). Người khác gọi quyết
  ⟹ 403 `BUDGET.NOT_SPENDING_APPROVER` như hiện hành. `version-decision-writer.service.ts` chỉ ghi `deciderRole =
'SPENDING_APPROVER'`.
- `renewal-decision.policy.ts`: `renewalDeciderOf(spendingApproverEmployeeId)`; bỏ người thay thế ở
  `subscription-renewal-parties.service.ts` (quyền đọc); bản đọc mục gia hạn thêm `waitingReason` như trên; `deciderRole` mới
  chỉ `SPENDING_APPROVER`. Ràng buộc `subscription_renewals_decider_role`, `budget_version_decisions_role_check` giữ giá trị
  cũ cho lịch sử.
- "Super Admin được báo" (`US-06-11` AC-12, `US-11-02` AC-23) — OD-4, `D-S16`: cảnh báo **sẵn có** _chưa có người duyệt hợp lệ_
  (`US-12-15` dòng 27, mở rộng), **không** thêm loại cảnh báo:
  - Mã: `CONTROLLED_WAIT_ALERT`; `IN_APP_NOTIFICATION_CODES` không đổi; `PARAM_KEYS_BY_CODE.CONTROLLED_WAIT_ALERT`
    (`notifications/inbox/inbox.policy.ts`) thêm `versionId`, `costCenterId`, `year`, `renewalId`, `subscriptionId` (chỉ id/năm,
    `FIGURE_WORDS` vẫn chặn số tiền). Notice: `subject` `BUDGET_VERSION` / `SUBSCRIPTION_RENEWAL`, `waitingReason =
'NO_SPENDING_APPROVER'`, `configurationHint = 'CONFIGURE_SPENDING_APPROVER'`, không `requestId`/`stepKind`.
  - Ba nguồn của **một** đoạn chờ (M7) — mỗi nguồn là lúc "có Người duyệt chi dùng được" chuyển thành "không":
    (i) Finance gửi phiên bản (`BudgetNotifierService.versionSent`) hoặc mục gia hạn chuyển sang chờ quyết khi không có ai dùng
    được — đọc grant `FOR SHARE` trước khi khóa phiên bản/mục (M6); (ii) `ApprovalRoleChange` `SPENDING_APPROVER` có
    `toEmployeeId = null` mà `fromEmployeeId` còn `ACTIVE` lúc thu hồi (người đã nghỉ thì đoạn chờ đã bắt đầu ở (iii)); (iii)
    `OrganizationChange` `EMPLOYEE_LEFT` (phát bởi `OrganizationHistoryApi.markEmployeeLeft` khi ghi `TERMINATED`) mà
    `employeeId` là người giữ grant `SPENDING_APPROVER`. Listener (ii), (iii) đăng ký ở `budgets` và `licensing` qua
    `ApprovalRoleChangeListeners`/`OrganizationChangeListeners` (tầng thấp hơn, được phép), chạy trong transaction của sự kiện,
    báo cho mọi phiên bản `SENT` / mục gia hạn chờ quyết lúc đó.
  - `eventKey` = `CONTROLLED_WAIT_ALERT:<BUDGET_VERSION|SUBSCRIPTION_RENEWAL>:<id>:<nguồn>`, `<nguồn>` = `sent:<sentAt ms>` |
    `role:<ApprovalRoleChange.id>` | `left:<OrganizationChange.id>` (≤ 200 ký tự); unique `(recipient, event_key)` ⟹ sự kiện nghe
    hai lần chỉ một notice; đoạn chờ mới (gán rồi thu hồi lại) có nguồn mới ⟹ notice mới. Không dùng `controlled_wait_alerts`
    (khóa ngoại tới bước Request); không bảng mới.
  - Người nhận: Super Admin hiện hành (cách tìm như `personnel-notifier.service.ts` `toSuperAdmin`).

### Lịch sử và giá trị cũ

`ApprovalDeciderRole` (Postgres enum) giữ `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`; `OffboardingRoleFlag` giữ
`SUBSTITUTE_APPROVER`, `FALLBACK_APPROVER`; `SpendBatchLeftReason` giữ `CONFLICT_OF_INTEREST` — không ghi mới, chỉ đọc lịch sử.
DTO đọc (`deciderRole` ở `access-request.dto.ts:126`, `group-request.dto.ts:94`, `need-decision-queue.dto.ts:40`,
`line-decision.repo.ts:14`; `bySubstitute`; cờ role-duties) giữ giá trị cũ, OpenAPI đánh dấu _historical_; DTO ghi/route cấu hình
bỏ hẳn (OD-5). Enum `waitingReason` đọc (`access-request.dto.ts:114`, `request-preview.dto.ts:33`, `spend-approval.dto.ts:157`,
`controlled-wait.dto.ts`) = giá trị mới ∪ giá trị cũ trong Phase A, chỉ giá trị mới ở Phase B.

### Gỡ cấu hình hai vai và người tiêu dùng (M3)

- Phase A: gỡ `approval-roles.controller.ts`, `approval-role.service.ts`, `approval-role.repo.ts` (ghi),
  `approval-role-reader.repo.ts`, `approval-role-holders.service.ts`, DTO, lỗi `APPROVAL_ROLE.*`, OpenAPI
  `approvalRoleList`/`approvalRoleSet` (route trả 404 như route không tồn tại); facade
  `IdentityAccessApi.getSpendingApproverEmployeeId(tx?: DbTx, options?: { forShare?: boolean }): Promise<string | null>` (người giữ
  grant, kể cả đã nghỉ — người tiêu dùng tự lọc) thay `getApprovalRoleHolders()`; `ApprovalRoleKind` chỉ còn
  `'SPENDING_APPROVER'`; `ApprovalRoleChange.role: 'SPENDING_APPROVER' | 'FINANCE'`.
- `ApprovalRoleFactsService` (`isSpendingApprover`, `heldRoles`, `rolesHeldBy` — dùng bởi `jwt-access-token-verifier.service.ts`,
  `identity-access-inspection.api.ts`, port `APPROVAL_ROLE_HOLDINGS` của `successor-eligibility.service.ts` cho
  `ops:recover transfer-role`) chỉ đọc grant; `successor-eligibility.service.ts` bỏ vế "còn giữ vai ở `approval_role_holders`";
  `identity-access.module.ts`, `identity-access-facade.module.ts`, `identity-access-inspection-facade.module.ts`,
  `identity-access-recovery-cli.module.ts` bỏ provider `ApprovalRoleRepo`.
- Người tiêu dùng `getApprovalRoleHolders` đổi sang facade mới: `requests` (`routing-facts.service.ts`, `step-target.service.ts`,
  `spend-entry.service.ts`, `spend-routing.service.ts`, `spend-decision-recorder.service.ts`, `group-spend-record.service.ts`,
  `budget-information.service.ts`, `assessment-query.service.ts`, `sla-recipient-facts.service.ts`, `approval-role.listener.ts`),
  `budgets/budget/budget-facts.service.ts`, `licensing/subscription-renewal/subscription-renewal-parties.service.ts`,
  `personnel/role-duties/role-duties.service.ts`, `installation/public/inspection.types.ts`, `cli/inspect/inspect-report.ts`,
  `dashboards/super-admin/super-admin-dashboard.service.ts`.
- **Gate Phase A:** không đọc `approval_role_holders` (delegate Prisma `approvalRoleHolder`, chuỗi SQL `approval_role_holders`)
  ở `src/` ngoài `src/modules/installation/migration-preflight/migration-preflight.repo.ts` (kiểm của roles đọc bảng trước
  migration) và `src/generated/` — thêm danh sách tên tệp chính xác vào `test/gates/architecture-boundaries.gate-spec.ts` (như
  `PRE_MIGRATION_READERS`); vì vậy image Phase A là đường lui hợp lệ cho CSDL sau Phase B.
- `personnel/role-duties`: chỉ cờ `SPENDING_APPROVER` (từ grant). Dashboard Super Admin bỏ link `approvalRoleList` (thay bằng
  link danh sách tài khoản hiện có). Inspection/`cli/inspect` bỏ số đếm hai vai. Demo dataset bỏ bước hai vai.
- Phase B: migration gỡ bảng (dưới).

### Lệnh chuyển đổi `pnpm ops:approval-role-conversion` (`QĐ-93k`, M4, H3)

Hợp đồng lệnh ghi (theo [operational-commands](../../../rules/operational-commands.md) và anh em `assign-subscription-owner`,
`cost-center-direction`, `demo-dataset`):

- Dòng bảng `src/cli/commands.ts`: name `approval-role-conversion`, alias `approval-role-conversion-cli` (alias giữ vĩnh viễn,
  `OD-A7` — Phase B **giữ** lệnh, khi đó nó chỉ trả 2); entry `src/cli/approval-role-conversion/{approval-role-conversion.command.ts,approval-role-conversion.arguments.ts,approval-role-conversion-cli.module.ts}`.
- Tham số: `--approved-by <tham chiếu>` (quyết định/phiếu cho phép chạy), `--operator <tham chiếu>`, `--environment
LOCAL_TEST|SHARED` (bắt buộc), `--dry-run`, `--json`, `--help`; từ chối tham số lạ và giá trị dạng mật khẩu/token theo tên như
  `record-super-admin-event`. Không phải lệnh ghi local (không ba chốt `--confirm-local`).
- Đồ thị: `ApprovalRoleConversionCliModule` = `ConfigurationModule` (env đầy đủ) + `DatabaseModule` + module capability
  `requests/approval-role-conversion/approval-role-conversion-cli.module.ts` (service, repo đọc, facade
  `requests/public/approval-role-conversion.api.ts`) và các module mà service gọi (`requests` providers đóng/xác định lại,
  `BudgetsApi`, `LicensingApi`, `NotificationsModule`, `AuditModule`, `IdentityAccessFacadeModule`, `OrganizationModule`); không
  controller, guard, sweep, queue; `NODE_ENV=production` nạp `RuntimeDatabaseRoleModule` ⟹ chạy bằng **runtime role** (ghi dữ
  liệu nghiệp vụ như API). Không tới được từ `AppModule`/`WorkerModule` (rule 3); `module-graph.gate-spec.ts`,
  `operational-commands.gate-spec.ts`, `extension-wiring.gate-spec.ts` ghim.
- Khóa: `trySessionAdvisoryLock(DATABASE_URL, 'approval-role-conversion')` giữ suốt lượt trên kết nối riêng (mỗi Request một
  transaction riêng); khóa bận ⟹ exit 3.
- Mã thoát: `0` đã ghi (hoặc `--dry-run` có việc) · `2` không còn gì để ghi · `4` bị chặn bởi kiểm trước (liệt kê, không ghi) ·
  `3` bị từ chối, không ghi (tham số, khóa bận, không có Super Admin để đứng tên, vai CSDL) · `1` lỗi giữa chừng (Request đã xong
  giữ nguyên; chạy lại tiếp). Đầu ra chỉ id và số đếm, không tên/email.
- `--dry-run`: chỉ đọc (không mở transaction ghi), in kế hoạch các bước 2–3 và danh sách việc tay.
- **Mô hình người thực hiện (H3).** Lượt chạy là `OperatorAuditActor` (`licensing/public/licensing-handover.types.ts`):
  `ticketId` = mã lượt (uuid, cũng là `correlationId`), `ticketRef` = `--approved-by`, `context` = `{ operator, environment,
command: 'approval-role-conversion' }`; mọi Audit Trail là `OPERATOR`, `actorAppUserId = null`. Cột người thực hiện của luồng
  cũ: `access_requests.cancelled_by_employee_id` và `access_request_lines.ended_by_employee_id` để **NULL** (OD-6, ràng buộc nới
  chỉ cho cause `SPENDING_APPROVER_PARTY`); cột NOT NULL kỹ thuật `provisioning_tasks.closed_by_app_user_id` nhận **tài khoản
  đứng tên** = tài khoản Super Admin hiện hành (`IdentityAccessApi.getSuperAdminHolder`), đúng mẫu
  `personnel/transfer/transfer-guard.service.ts` `standIn` (chỉ điền cột, audit vẫn `OPERATOR`); không có Super Admin ⟹ exit 3.
  Không đi qua `DepartureCancellationService`/`GroupLineClosureService` (đòi principal `IT_ADMIN`, chỉ nhận cause người thụ hưởng
  rời đi/điều chuyển): service chuyển đổi dùng lại các khối bên dưới của chúng.
- **Đổi API công khai của `licensing`.** `GrantCancelCause` thêm `'SPENDING_APPROVER_PARTY'`; `GrantCancelInput` thêm
  `operator?: OperatorAuditActor` (truyền tới `licensingAuditEvent` và `AssignmentService.cancel` — `EndWithoutSeatInput` thêm
  `operator?`); `cancelReasonOf('SPENDING_APPROVER_PARTY')` = `SPENDING_APPROVER_PARTY_CANCEL_REASON` (`close_reason` là TEXT);
  `grantCancelAction(status, 'SPENDING_APPROVER_PARTY', _)`: `QUEUED`, `RETRY_SCHEDULED`, `FAILED` ⟹ `CANCEL`; `IN_PROGRESS` ⟹
  `RUNNING` (không hủy — không có bằng chứng của IT Admin; guard `provisioning_task_transition_guard` không cần đổi);
  `COMPLETED` ⟹ `COMPLETED`; `CLOSED_FAILED`/`CANCELLED` ⟹ `ENDED`.

Các bước (mỗi Request một transaction; thứ tự khóa: grant `SPENDING_APPROVER` `FOR SHARE` → task cấp phát
(`lockGrantOfRequest`) → Request `FOR UPDATE` → dòng; đọc lại dưới khóa rồi mới quyết):

1. **Kiểm trước (`QĐ-93k`(4))** — có dòng ⟹ exit 4, không ghi gì: người giữ grant vi phạm `QĐ-93a`/`QĐ-93b` (kiểm lại sau roles);
   phiên bản `SENT`/`CHANGES_REQUESTED` lập từ đề xuất của người giữ grant (từng chờ người thay thế); mục gia hạn chờ quyết có
   người đề xuất là người giữ grant.
2. **Đóng Request (`QĐ-93k`(1))** — Request mở (ngoài `ENDED_STATES`, khác `DRAFT`) mà người giữ grant là người yêu cầu, người thụ
   hưởng, dòng nhóm còn sống hoặc người chịu trách nhiệm tài khoản dịch vụ, kể cả Request có bước chi đang giao người thay thế:
   - Request không phải nhóm, hoặc nhóm mà người đó là người gửi: `licensing.cancelGrantOfRequest(tx, standIn, { …, cause:
'SPENDING_APPROVER_PARTY', operator })` — `NO_TASK`/`CANCELLED` ⟹ tiếp; `RUNNING`/`COMPLETED` ⟹ **không đóng**, liệt kê việc tay
     (`GRANT_IN_PROGRESS`/`GRANT_COMPLETED`); rồi `RequestEndService.close(tx, standIn, request, 'REQUEST_CANCELLED', now,
operator)` (đóng bước, câu hỏi Finance, rời lô, giải phóng phần cam kết **chưa chi** qua `BudgetsApi.releaseForRequest` —
     `QĐ-83a`; `close`/`BudgetInformationService.closeOpen` thêm `operator?` cho audit) → `setCancellation({ cancelledAt: now,
cancelledByEmployeeId: null, cause: 'SPENDING_APPROVER_PARTY', note: null })` → audit `ACCESS_REQUEST.CANCELLED` (`OPERATOR`;
     `reasonKind`, `cancelledByEmployeeId: null`, task, số cam kết và phần giải phóng như `DepartureCancellationService`) →
     `RequestOutcomeService.ended` (thông báo người yêu cầu và người thụ hưởng). Nhóm do người đó gửi: mọi dòng còn sống đóng như
     dưới, rồi Request kết thúc qua `GroupResolutionService.resolve(tx, null, …)`.
   - Nhóm mà người đó chỉ là một dòng (OD-6): `lockGrantOfRequest(tx, id, người đó)` → dòng `FOR UPDATE` → hủy task như trên →
     `lines.move({ state: 'CANCELLED', endedAt: now, endedByEmployeeId: null, endReason: null, cancelCause:
'SPENDING_APPROVER_PARTY' })` → `GroupGrantService.release` nếu dòng giữ tiền → audit `ACCESS_REQUEST.LINE_CANCELLED`
     (`OPERATOR`) → `outcomes.ended(tx, request, [người đó], now)` → `GroupResolutionService.resolve(tx, null, …)` (đường hệ thống
     có sẵn). `group-resolution.policy.ts` `requestEndingOf`: dòng cuối có cause `SPENDING_APPROVER_PARTY` ⟹
     `cancelledByEmployeeId: null` (kiểu thành `string | null`) thay vì rơi về người yêu cầu.
   - Request hoàn trả (`return_requests` `AWAITING_REVOCATION`) có người giữ grant là bên ⟹ **liệt kê**, không đóng (OD-7).
3. **Xác định lại (`QĐ-93k`(2))** — Request còn bước `legacy` (cùng `isLegacyStep`; bước chi theo _Luật bước chi cũ_) sau bước
   2 ⟹ `StepReassignmentService.reconcileRequests(tx, [id], {
kind: 'QD93_CONVERSION', employeeId: null }, runId, now, operator)` ⟹ giao trưởng phòng/Người duyệt chi, hoặc chờ/chờ lại
   `NO_DEPARTMENT_HEAD`/`NO_SPENDING_APPROVER`; tuổi SLA giữ; audit có `trigger: 'QD93_CONVERSION'`, `source` = mã lượt, người cũ,
   người mới hoặc lý do chờ (`US-05-12` AC-10).
4. **Giữ nguyên** bước chi đã tạo thẳng cho phòng thiếu trưởng phòng trước chuyển đổi (`QĐ-93k`(3)).
5. **Báo cáo:** số Request đóng, dòng nhóm đóng, bước giao lại/chờ/chờ lại, và danh sách việc tay cho Super Admin/IT Admin:
   Request hoàn trả (OD-7), Request có task cấp phát `IN_PROGRESS`/`COMPLETED`. Việc tay xong thì chạy lại lệnh (Request đã kết
   thúc không còn bị chọn; Request còn mở với task `QUEUED`/`FAILED` được đóng).

### Migration

Luật timestamp (`DB-15`, áp cho mọi thư mục dưới): implementer đặt timestamp thật khi tạo thư mục; trước merge, rebase lên
`dev`, đổi timestamp cho đứng sau migration mới nhất trên `dev` (ở `1a77ffe8`:
`20261101000200_licensing_subscription_renewals`). KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư
mục migration mới xếp sau cùng nên gate migration-order vẫn xanh); Owner thêm vào danh sách khi phát hành. `<ts>`/`<ts+1>`
dưới đây là chỗ giữ theo đúng luật đó. Đọc lại định nghĩa ràng buộc trên `dev` lúc implement (hạng mục khác có thể đã đổi).

- Phase A `<ts>_requests_spending_approver_party_values` (riêng một migration: giá trị enum mới chỉ dùng được sau khi commit):
  `ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'SPENDING_APPROVER_PARTY';` — dòng nhóm dùng **cùng** enum
  (`20261025010100_requests_line_cancellation`), không enum riêng.
- Phase A `<ts+1>_requests_spending_approver_party_cancellation` (định nghĩa hiện hành ở `20261024200100_requests_cancellation` và
  `20261025010100_requests_line_cancellation`):

```sql
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_cancellation_columns";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cancellation_columns" CHECK (
  (
    ("state" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancel_cause" IS NOT NULL
       AND ("cancelled_by_employee_id" IS NOT NULL OR "cancel_cause" = 'SPENDING_APPROVER_PARTY'))
    OR ("state" <> 'CANCELLED' AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
       AND "cancel_cause" IS NULL AND "cancel_note" IS NULL)
  )
  AND ("cancel_note" IS NULL OR length(btrim("cancel_note")) > 0)
);
ALTER TABLE "access_request_lines" DROP CONSTRAINT "access_request_lines_ender_state_check";
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_ender_state_check" CHECK (
  "state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED', 'AWAITING_IT_CLOSE', 'CANCELLED')
  OR "ended_by_employee_id" IS NOT NULL
  OR ("state" = 'CANCELLED' AND "cancel_cause" = 'SPENDING_APPROVER_PARTY')
);
```

- **Dạng dữ liệu mà runtime cũ không đọc được (M5)** — thêm vào `DATA_REPRESENTATIONS`
  (`installation/public/recovery-target.policy.ts`), nhãn `io.github.baophipham.slm.data-reads` của `Dockerfile` và câu đếm
  `SELECT` của repo preflight (`--recovery-target`) trong **cùng** thay đổi: `access-request-cancel-spending-approver-party`
  (dòng `access_requests`/`access_request_lines` có `cancel_cause::text = 'SPENDING_APPROVER_PARTY'` — Prisma client cũ không
  biết giá trị enum, cột người đóng NULL) và `access-request-step-qd93-waiting-reason` (`access_request_steps`/
  `controlled_wait_alerts` có `waiting_reason IN ('NO_DEPARTMENT_HEAD', 'SPENDING_APPROVER_IS_PARTY')` — enum response cũ +
  `ZodSerializerInterceptor` ⟹ 500). Phase B không thêm dạng mới.
- Phase B `<ts>_identity_drop_approval_role_holders`: guard `DO $$` dừng `P0001`, nêu dòng chặn, nếu còn (người giữ grant
  `approver` = `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SPENDING_APPROVER'
AND g.revoked_at IS NULL`):
  - (i) Request mở (`state NOT IN ('REJECTED','IT_REJECTED','COMPLETED','FAILED','WITHDRAWN','CANCELLED','DRAFT')`) mà `approver`
    là `requester_employee_id`, có dòng `access_request_beneficiaries`, có dòng `access_request_lines` còn sống (`state NOT IN
('NEED_REJECTED','SPEND_REJECTED','COMPLETED','FAILED','WITHDRAWN','DROPPED','CANCELLED')`) hoặc là
    `access_request_service_accounts.responsible_employee_id`;
  - (ii) bước `(kind = 'NEED' AND state = 'PENDING' AND routing_row IN (3, 4))` hoặc `(state = 'WAITING' AND waiting_reason IN
('NO_FALLBACK_APPROVER', 'FALLBACK_IS_REQUESTER', 'NO_CONFLICT_SUBSTITUTE', 'SPENDING_APPROVER_IS_PARTY'))` — không dùng
    literal `OPEN` (không phải giá trị `AccessRequestStepState`, ép kiểu là lỗi `22P02`); bước chờ `NO_DEPARTMENT_HEAD` dòng 4
    không bị tính;
  - (iii) bước chi cũ theo _Luật bước chi cũ_: `s.kind = 'SPEND_APPROVAL' AND s.state = 'PENDING' AND NOT EXISTS (SELECT 1 FROM
role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SPENDING_APPROVER' AND u.employee_id =
s.assignee_employee_id)` (mọi dòng grant, kể cả đã thu hồi) — bước chi của người giữ cũ/đã nghỉ (có dòng grant) không chặn,
    nên thu hồi/chuyển vai thường không bao giờ làm guard chặn mãi;
  - rồi: viết lại hàm `role_grants_forbid_super_admin_for_heads_and_approvers()` (trigger `role_grants_super_admin_exclusions`,
    `20261016190000_super_admin_exclusions`) từ **định nghĩa hiện hành** (`pg_get_functiondef` + thay đúng một khối, dừng nếu khối
    `approval_role_holders` không xuất hiện đúng một lần — mẫu `20261029101000_provisioning_transfer_cancel_reason`, vì roles có thể
    đã đổi hàm này), bỏ khối `EXISTS (… approval_role_holders …)`, giữ khối trưởng phòng; `DROP TRIGGER approval_role_holders_distinct
ON approval_role_holders`; `DROP FUNCTION approval_role_holders_distinct_approver_and_substitute()` (không để hàm mồ côi);
    `DROP TABLE approval_role_holders`; `DROP TYPE "ApprovalRole"`; gỡ model Prisma và quan hệ `Employee.approvalRoles`. Lịch sử
    người giữ vai còn ở Audit Trail `APPROVAL_ROLE.CHANGED` (OD-5).
- `pnpm ops:preflight` thêm đúng ba dòng chặn (i)–(iii) (cùng câu, chỉ `SELECT`) cho migration Phase B.
- Phase B code: bỏ đóng băng (`legacy`, `QD93_CONVERSION` khỏi `decideReassignment`), `STEP_AWAITING_CONVERSION`, ba lý do cũ +
  `SPENDING_APPROVER_IS_PARTY`, hai gợi ý cũ, nhánh `null` của `deciderRoleOf`, `IdentityAccessApi.everHeldSpendingApproverAmong`
  (không còn người dùng); lệnh chuyển đổi giữ (alias), chỉ còn trả 2.
- Rollback: Phase A — hoàn tác code; giá trị enum thêm vào vô hại; hai ràng buộc khôi phục bằng SQL định nghĩa cũ ghi trong PR (chỉ
  được khi chưa có dòng cause `SPENDING_APPROVER_PARTY` với cột người đóng NULL); image trước Phase A chỉ là đường lui khi
  `--recovery-target` báo không có hai dạng dữ liệu trên. Request đã đóng **không** mở lại tự động. Phase B — không đảo được (bảng
  đã gỡ); image Phase A vẫn phục vụ được (gate không đọc bảng); chỉ triển khai khi Owner duyệt sau khi Phase A chạy ổn ở mọi môi
  trường.

### Quyết định kỹ thuật (Owner duyệt 01/11/2026)

- **OD-1** (Owner duyệt 01/11/2026): bước chờ phòng thiếu trưởng phòng ghi `routing_row = 4` (theo số dòng của bảng
  `US-05-03`), lý do `NO_DEPARTMENT_HEAD`. Guard Phase B chỉ tính bước `PENDING` ở dòng 3/4 (mục _Migration_), nên dòng 4 của bước
  chờ không chặn.
- **OD-2** (Owner duyệt 01/11/2026, **thay bởi `D-S21`**): bản trước dùng mã theo họ route; nay một mã
  `REQUEST_PARTY.INELIGIBLE` 422 cho mọi route (mục _Hợp đồng từ chối bên của Request_).
- **OD-3** (Owner duyệt 01/11/2026): chặn cả tạo bản nháp của Người duyệt chi (tránh nháp không gửi được); nháp nhóm chặn cả dòng.
- **OD-4** (Owner duyệt 01/11/2026 — `QĐ-93d`(1) `D-S16`): "Super Admin được báo" (`US-06-11` AC-12, `US-11-02` AC-23) dùng
  cảnh báo dòng 27 sẵn có, **mở rộng** cho phiên bản ngân sách và mục gia hạn (mã `CONTROLLED_WAIT_ALERT`), phát một lần cho mỗi
  đoạn chờ. Đã loại: thêm loại cảnh báo mới; chỉ hiện `waitingReason` trên màn đọc mà không báo.
- **OD-5** (Owner duyệt 01/11/2026): giữ giá trị lịch sử trong enum CSDL và DTO đọc; gỡ bảng `approval_role_holders` (lịch sử
  còn ở Audit Trail). Đã loại: đổi tên thành bảng lưu trữ.
- **OD-6** (Owner duyệt 01/11/2026): lệnh chuyển đổi đóng **dòng** của Người duyệt chi trong yêu cầu nhóm có người thụ hưởng
  khác (đóng cả Request khi người đó là người yêu cầu); đóng bởi lệnh vận hành không có `cancelled_by_employee_id`/
  `ended_by_employee_id` (audit `OPERATOR`, mô hình người thực hiện ở mục lệnh chuyển đổi).
- **OD-7** (Owner duyệt 01/11/2026; Docs ghi vào `QĐ-93k`): Request hoàn trả (`return_requests` `AWAITING_REVOCATION`) có Người
  duyệt chi là bên: lệnh **liệt kê** cho Super Admin, không tự đóng (đang có việc thu hồi; `QĐ-93d`(3) giữ seat của người đó). Đã
  loại: tự đóng kèm hủy tác vụ thu hồi. Cùng cách cho task cấp phát `IN_PROGRESS`/`COMPLETED`.

## Contract changes FE cần biết

| Operation / màn                                                                                                                                                                                                                                                                           | Thay đổi                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approvalRoleList`, `approvalRoleSet` (`GET/PUT /approval-roles`)                                                                                                                                                                                                                         | **bỏ** (404); Người duyệt chi gán qua role-grants (hạng mục trước); không còn `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`                                                                                                            |
| `accessRequestSubmit`, `accessRequestPropose`, `accessRequestServiceAccountSubmit`, `accessRequestRenewalSubmit`, `accessRequestDraftSave`, `accessRequestDraftSubmit`, `delegatedRequestSend`, `groupRequestCheck`, `groupRequestSubmit`, `returnRequestSubmit`, `provisioningTaskGrant` | 422 mới `REQUEST_PARTY.INELIGIBLE`, `details: { reason: 'SPENDING_APPROVER' \| 'UNPLACED', party: 'REQUESTER' \| 'BENEFICIARY', employeeIds: string[] }` (`UNPLACED` do hạng mục unplaced)                                          |
| `accessRequestPreview`                                                                                                                                                                                                                                                                    | thêm `blockedBy: { reason, party, employeeIds } \| null`; `canSubmit: false` khi có; dòng 4 `WAITS_FOR_DEPARTMENT_HEAD`; `role` bỏ `FALLBACK_APPROVER`                                                                              |
| `groupRequestCheck` (200), `GROUP_REQUEST.LINES_REFUSED`                                                                                                                                                                                                                                  | lý do dòng mới `SPENDING_APPROVER` (hạng mục unplaced thêm `UNPLACED`)                                                                                                                                                              |
| `groupRequestCandidateList`                                                                                                                                                                                                                                                               | không còn Người duyệt chi (và người chưa xếp phòng); paging tính sau khi loại; người gọi là Người duyệt chi (hoặc chưa xếp phòng) ⟹ 422 `REQUEST_PARTY.INELIGIBLE` `party: 'REQUESTER'`                                             |
| `accessRequestNeedDecide`, `accessRequestLineNeedDecide`, `spendApprovalDecide`, `spendApprovalLineDecide`; `spendBatchDecide`                                                                                                                                                            | Phase A: 409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION` (bước cũ đóng băng); lý do bỏ qua mục `STEP_AWAITING_CONVERSION`; Phase B bỏ                                                                                                 |
| `controlledWaitList` (`GET /controlled-waits`), chi tiết Request/bước, `spendApprovalGet`                                                                                                                                                                                                 | `waitingReason` thêm `NO_DEPARTMENT_HEAD` (và tạm `SPENDING_APPROVER_IS_PARTY`); bỏ `NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`, `NO_CONFLICT_SUBSTITUTE` (Phase B); `configurationHint` bỏ hai giá trị (Phase B)               |
| `deciderRole` (Request, dòng nhóm, hàng đợi nhu cầu, phiên bản, gia hạn), `bySubstitute`                                                                                                                                                                                                  | giá trị mới chỉ `MANAGER`/`SPENDING_APPROVER`; giá trị cũ chỉ còn ở lịch sử (deprecated)                                                                                                                                            |
| bản đọc phiên bản ngân sách, mục gia hạn                                                                                                                                                                                                                                                  | thêm `waitingReason` nullable                                                                                                                                                                                                       |
| hộp thông báo Super Admin (`CONTROLLED_WAIT_ALERT`)                                                                                                                                                                                                                                       | có thể có `subject` `BUDGET_VERSION` (`versionId`, `costCenterId`, `year`) hoặc `SUBSCRIPTION_RENEWAL` (`renewalId`, `subscriptionId`), không `requestId`/`stepKind`; bước nhu cầu `NO_DEPARTMENT_HEAD` nay cũng phát; không mã mới |
| quyết định phiên bản                                                                                                                                                                                                                                                                      | người thay thế không còn quyền đọc/quyết                                                                                                                                                                                            |
| hồ sơ nghỉ việc (`roleFlags`)                                                                                                                                                                                                                                                             | không còn `SUBSTITUTE_APPROVER`, `FALLBACK_APPROVER` cho hồ sơ mới                                                                                                                                                                  |
| dashboard Super Admin                                                                                                                                                                                                                                                                     | bỏ link `approvalRoleList`                                                                                                                                                                                                          |

Ví dụ OpenAPI (`OPENAPI-EXAMPLE.1`): mỗi operation trên khai đúng mã ở đúng status trong `test/support/openapi-example-route-codes-requests.ts`
(`accessRequestSubmit`, `accessRequestPropose`, `accessRequestServiceAccountSubmit`, `accessRequestRenewalSubmit`,
`accessRequestDraftSave`, `accessRequestDraftSubmit`, `delegatedRequestSend`, `returnRequestSubmit`, `accessRequestNeedDecide` —
`'422': [… 'REQUEST_PARTY.INELIGIBLE']`, `'409': [… 'ACCESS_REQUEST.STEP_AWAITING_CONVERSION']`),
`openapi-example-route-codes-requests-spend.ts` (`groupRequestCandidateList`, `groupRequestCheck`, `groupRequestSubmit`,
`accessRequestLineNeedDecide`, `spendApprovalDecide`, `spendApprovalLineDecide`), `openapi-example-route-codes-licensing.ts` (`provisioningTaskGrant`); bỏ
`approvalRoleSet` ở `openapi-example-route-codes-identity-access.ts` và `approvalRoleList`/`approvalRoleSet` (message thành công) ở
`openapi-example-manifest.ts`; ví dụ dựng bằng `errorExampleOf(toXApiException(new RequestPartyIneligibleError(…)))` với placeholder
`'<employee-id>'`.

## Test matrix

| AC / rủi ro                                      | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                                                 | Cấp test                                                                                                                                                                                                                                                                                                                                                                                                  | Kết quả mong đợi                                                                                                                                                                                                                                                                                          | Bằng chứng sau implement |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-03 AC-4                                    | `E4` thuộc `P-HR` không trưởng phòng gửi Figma; rút được; gán `H7` (giữ `MANAGER`, thành viên)                                                                                                                                                                                      | unit `src/modules/requests/access-request/routing.policy.spec.ts`; integration `test/integration/requests/controlled-wait.integration-spec.ts`                                                                                                                                                                                                                                                            | bước `WAITING NO_DEPARTMENT_HEAD` dòng 4, không bước chi/kiểm ngân sách; sau gán ⟹ giao `H7` dòng 1, `created_at` giữ                                                                                                                                                                                     | planned                  |
| US-05-11 AC-6, US-12-15 AC-25 (`D-S20`)          | như trên; cảnh báo; `R30` chờ chi sau thu hồi vai                                                                                                                                                                                                                                   | integration `controlled-wait.integration-spec.ts`, `test/integration/requests/request-status-notifications.integration-spec.ts`; unit `reassignment.policy.spec.ts`                                                                                                                                                                                                                                       | Super Admin nhận một `CONTROLLED_WAIT_ALERT` (`NO_DEPARTMENT_HEAD`, `ASSIGN_DEPARTMENT_HEAD`) + `MISSING_HEAD` đọc; `R30` dòng 27; không IT Admin, không ai nhận với tư cách hai vai cũ                                                                                                                   | planned                  |
| US-05-11 AC-10, US-06-01 AC-22                   | bước chi `R30` chờ `C1` 2 ngày; thu hồi vai, chưa gán; Finance/Super Admin/trưởng phòng không được giao; gán `C2`                                                                                                                                                                   | integration `test/integration/requests/step-reassignment-paid.integration-spec.ts`; unit `spend-routing.policy.spec.ts`                                                                                                                                                                                                                                                                                   | `WAITING NO_SPENDING_APPROVER`; rồi `C2`, SLA không đặt lại; không bước nào có lý do xung đột                                                                                                                                                                                                             | planned                  |
| M6 — đua thu hồi ↔ giao bước chi / gửi phiên bản | thu hồi `C1` song song trình lô mở bước chi, và song song Finance gửi phiên bản (cả hai thứ tự commit); gán `C2` song song mở bước chi                                                                                                                                              | integration mới `test/integration/requests/spend-approver-revoke-race.integration-spec.ts`, `test/integration/budgets/budget-version-history.integration-spec.ts`                                                                                                                                                                                                                                         | không bước chi `PENDING` nào giữ bởi người đã bị thu hồi; phiên bản được báo đúng một lần; bước chờ do gán song song được sweep `WAITING_RETRY` giao `C2`                                                                                                                                                 | planned                  |
| US-05-12 AC-3                                    | `H1` nghỉ việc, `P-DES` chưa có trưởng phòng mới; rồi chỉ định `H3`                                                                                                                                                                                                                 | integration `test/integration/requests/step-reassignment.integration-spec.ts`                                                                                                                                                                                                                                                                                                                             | chờ `NO_DEPARTMENT_HEAD`; rồi `H3`, SLA giữ                                                                                                                                                                                                                                                               | planned                  |
| US-05-12 AC-11, US-01-02 AC-10                   | bước của `R4` chờ 3 ngày; gán `H7` từ hôm nay ⟹ giao; gán từ ngày `D` tương lai ⟹ chờ tới `D` (sweeper) rồi giao; `U5` giữ `MANAGER` không trưởng phòng ⟹ không nhận                                                                                                                | integration `step-reassignment.integration-spec.ts` (đồng hồ giả của sweeper hiện có)                                                                                                                                                                                                                                                                                                                     | đúng như AC; tuổi SLA 3 ngày giữ; audit nguồn _gán trưởng phòng_                                                                                                                                                                                                                                          | planned                  |
| B1 — chờ lại                                     | bước chờ `NO_FALLBACK_APPROVER` của `P-HR` (vẫn thiếu) gặp `QD93_CONVERSION`; bước chờ `NO_SPENDING_APPROVER` mà nay lý do đúng là `SPENDING_APPROVER_IS_PARTY`                                                                                                                     | unit `reassignment.policy.spec.ts` (`REWAIT`); integration `step-reassignment.integration-spec.ts`                                                                                                                                                                                                                                                                                                        | `waiting_reason` đổi, `waiting_since`/`created_at`/`routing_row` giữ; audit `STEP_WAITING_REASON_CHANGED`; không cảnh báo thứ hai cho cùng đoạn chờ; `/controlled-waits` gợi ý mới                                                                                                                        | planned                  |
| H2 — đóng băng                                   | trước khi chuyển đổi: sweep ngày, `WAITING_RETRY`, `HOLDER_LEFT`, đổi trưởng phòng gặp bước dòng 3/4, bước chờ lý do cũ, bước chi người thay thế giữ (người giữ chưa từng có dòng grant `SPENDING_APPROVER`); người giữ gọi quyết                                                   | unit `reassignment.policy.spec.ts`, `need-decision.policy.spec.ts`, `spend-decision.policy.spec.ts`; integration `step-reassignment.integration-spec.ts`, `test/integration/requests/spend-need-decision.integration-spec.ts`, `test/integration/requests/need-decision-queue-handover.integration-spec.ts`                                                                                               | không bước nào di chuyển, không audit; quyết ⟹ 409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION`; lô bỏ qua mục với lý do đó; hàng đợi nhu cầu không trả bước dòng 3/4                                                                                                                                        | planned                  |
| B (vòng 2) — luật bước chi cũ                    | `C1` giữ bước chi `PENDING` của `R30`; thu hồi `C1` (chưa gán ai), rồi chuyển vai `C1` → `C2`; `S` (người thay thế cũ, dựng bằng SQL) giữ bước chi `R31` của Request có `C1` là bên; sau đó thu hồi `C2` và gán `SPENDING_APPROVER` cho `S`                                         | unit `reassignment.policy.spec.ts` (`isLegacyStep`), `spend-decision.policy.spec.ts`; integration `test/integration/requests/step-reassignment-paid.integration-spec.ts`, `test/integration/requests/spend-approval.integration-spec.ts`                                                                                                                                                                  | `R30` không `legacy`: thu hồi ⟹ chờ `NO_SPENDING_APPROVER`, chuyển ⟹ giao `C2` (audit `ROLE_HOLDER_CHANGED`, SLA giữ), `C2` quyết 200 — không bao giờ 409; `R31` đứng yên qua thu hồi/chuyển/sweep, `S` quyết ⟹ 409 `STEP_AWAITING_CONVERSION`; khi `S` đã nhận grant ⟹ `R31` hết `legacy`, `S` quyết 200 | planned                  |
| US-05-12 AC-10                                   | dữ liệu cũ: `R0` (approver dự phòng) giữ bước của `E4` (`P-HR` vẫn thiếu), `E6` (`P-OPS` nay có `H6`), `E8` (`R0` nay là trưởng phòng `P-FIN`); chạy lệnh chuyển đổi                                                                                                                | integration mới `test/integration/requests/approval-role-conversion.integration-spec.ts`                                                                                                                                                                                                                                                                                                                  | `E4` chờ `NO_DEPARTMENT_HEAD`, `E6` giao `H6`, `E8` giao `R0` dòng 1; không còn bước dòng 3/4 `PENDING`; SLA giữ; audit `trigger QD93_CONVERSION`, `OPERATOR`                                                                                                                                             | planned                  |
| `QĐ-93k`(1), H3                                  | Request đơn, tài khoản dịch vụ, gia hạn có `C1` là bên (task `QUEUED`, `FAILED`, `IN_PROGRESS`, `COMPLETED`; gồm bước chi ở người thay thế); nhóm có `C1` là một dòng / người gửi                                                                                                   | integration `approval-role-conversion.integration-spec.ts`; unit `src/modules/licensing/provisioning/grant-cancellation/grant-cancellation.policy.spec.ts`                                                                                                                                                                                                                                                | đóng cause `SPENDING_APPROVER_PARTY`, người đóng NULL, cam kết chưa chi giải phóng, audit `OPERATOR`, thông báo; `IN_PROGRESS`/`COMPLETED` không đóng, liệt kê; dòng nhóm đóng, dòng khác giữ                                                                                                             | planned                  |
| `QĐ-93k`(3), (4); idempotent; M4                 | bước chi `DIRECT` cũ giữ; phiên bản chờ người thay thế ⟹ exit 4 không ghi; chạy lại ⟹ exit 2; `--dry-run` không ghi; lượt thứ hai song song ⟹ exit 3; thiếu `--approved-by`                                                                                                         | integration `approval-role-conversion.integration-spec.ts`; unit `src/cli/approval-role-conversion/approval-role-conversion.arguments.spec.ts`                                                                                                                                                                                                                                                            | đúng như mô tả; OD-7 Request hoàn trả chỉ được liệt kê                                                                                                                                                                                                                                                    | planned                  |
| US-06-14 AC-8                                    | `P-HR` thiếu trưởng phòng: `R14` chờ nhu cầu, `R15` đã xác nhận trong hàng đợi; gán `H8`; `H8` xác nhận và trình lô                                                                                                                                                                 | integration `test/integration/requests/spend-batches.integration-spec.ts`; unit `src/modules/requests/spend/spend-submission.policy.spec.ts`                                                                                                                                                                                                                                                              | không bước chi/kiểm ngân sách nào trước khi có `H8`; sau đó như AC-1                                                                                                                                                                                                                                      | planned                  |
| US-05-02 AC-13 (`D-S21`)                         | `C1` tự gửi đủ sáu loại; `H5` tạo thay cho `C1`; nhóm có `C1` (nhập mã); `C1` lưu nháp đơn và nháp nhóm, `E5` lưu nháp nhóm có dòng `C1`                                                                                                                                            | unit `src/modules/identity-access/request-party/request-party.policy.spec.ts` (thứ tự bên/lý do, trùng hai lý do, `ineligibleReasons`); integration mới `test/integration/requests/spending-approver-party.integration-spec.ts`                                                                                                                                                                           | 422 `REQUEST_PARTY.INELIGIBLE`, đúng `reason`/`party`/`employeeIds` mỗi route; không Request/bước/cam kết/thông báo/nháp                                                                                                                                                                                  | planned                  |
| US-05-01 AC-16                                   | `C1` xem trước Figma và phần mềm nội bộ                                                                                                                                                                                                                                             | integration `test/integration/requests/access-request-preview.integration-spec.ts`                                                                                                                                                                                                                                                                                                                        | 200, `blockedBy = { reason: 'SPENDING_APPROVER', party: 'REQUESTER', employeeIds: [C1] }`, `canSubmit: false`                                                                                                                                                                                             | planned                  |
| US-03-02 AC-15 (`D-S22`), US-05-17 AC-18         | `H1` mở danh sách chọn; `C1` mở danh sách chọn; tạo thay cho `E2` + `C1`; nhóm có `C1` (`/check` và gửi)                                                                                                                                                                            | integration `test/integration/requests/spend-delegated-requests.integration-spec.ts`, `test/integration/requests/group-request-submit.integration-spec.ts`                                                                                                                                                                                                                                                | danh sách không có `C1`, `totalItems` đúng; `C1` gọi ⟹ 422 `{ SPENDING_APPROVER, REQUESTER, [C1] }`; tạo thay 422 `party BENEFICIARY`, `employeeIds [C1]`, không Request nào cho `E2`; dòng `C1` lý do `SPENDING_APPROVER`, dòng khác không đổi                                                           | planned                  |
| US-05-03 AC-15                                   | Request của `C1` (tự gửi/tạo thay/nhóm) tới định tuyến                                                                                                                                                                                                                              | integration `spending-approver-party.integration-spec.ts`                                                                                                                                                                                                                                                                                                                                                 | không bước nào được tạo; không bao giờ có bước chi giao `C1` cho Request có `C1` là bên                                                                                                                                                                                                                   | planned                  |
| US-05-13 AC-11, US-05-14 AC-6                    | `C1` gửi hoàn trả/gia hạn; `H5` xác nhận `C1` _không còn nhu cầu_ / tạo gia hạn cho `C1`                                                                                                                                                                                            | integration `test/integration/requests/return-request.integration-spec.ts`, `test/integration/requests/return-renewal-constraints.integration-spec.ts`                                                                                                                                                                                                                                                    | 422 chung (`REQUESTER` / `BENEFICIARY`); không việc thu hồi/cảnh báo/Request; Assignment giữ                                                                                                                                                                                                              | planned                  |
| US-05-20 AC-12                                   | `C1` xin phần mềm nội bộ không phí; `H5` tạo thay                                                                                                                                                                                                                                   | integration `test/integration/requests/access-request-internal-path.integration-spec.ts`                                                                                                                                                                                                                                                                                                                  | 422 dù không có bước chi                                                                                                                                                                                                                                                                                  | planned                  |
| US-05-21 AC-8 (H5)                               | `C1` gửi tài khoản dịch vụ tự chịu trách nhiệm; IT Admin cấp `R9` với `responsibleEmployeeId = C1`                                                                                                                                                                                  | integration `test/integration/requests/service-account-request.integration-spec.ts` (đã có ca cấp phát với `responsibleEmployeeId`)                                                                                                                                                                                                                                                                       | 422 chung (`REQUESTER` / `BENEFICIARY`); không task, Assignment; người chịu trách nhiệm không đổi                                                                                                                                                                                                         | planned                  |
| US-06-14 AC-16 (`D-S23`)                         | hồ sơ bổ sung của `R4` gửi khóa thêm người; hồ sơ bỏ `E3` / đổi ngày                                                                                                                                                                                                                | integration `test/integration/requests/spend-supplements.integration-spec.ts`                                                                                                                                                                                                                                                                                                                             | khóa thêm ⟹ 422 `VALIDATION_ERROR`, `R4` không đổi; bỏ/đổi ngày như hiện hành                                                                                                                                                                                                                             | planned                  |
| Rủi ro đua gán vai ↔ tạo Request                 | lệnh gán `SPENDING_APPROVER` cho `E7` song song `E7` gửi Request (cả hai thứ tự)                                                                                                                                                                                                    | integration mới `test/integration/requests/spending-approver-party-concurrency.integration-spec.ts`                                                                                                                                                                                                                                                                                                       | đúng một bên thành công; không tồn tại Request mở có người giữ vai là bên                                                                                                                                                                                                                                 | planned                  |
| US-06-11 AC-12                                   | `V1` chờ `C1`; thu hồi vai; Finance/trưởng phòng/Super Admin gọi quyết; gán `C2`                                                                                                                                                                                                    | integration `test/integration/budgets/budget-version-history.integration-spec.ts` (hoặc file quyết định phiên bản hiện có)                                                                                                                                                                                                                                                                                | `waitingReason NO_SPENDING_APPROVER`; Super Admin nhận một `CONTROLLED_WAIT_ALERT` (`subject` `BUDGET_VERSION`); 403 cho người khác; `C2` quyết được; không người thay thế                                                                                                                                | planned                  |
| US-11-02 AC-23                                   | mục gia hạn chờ `C1`; thu hồi 20/11; người khác gọi quyết; gán `C2` 25/11                                                                                                                                                                                                           | integration `test/integration/licensing/subscription-renewal-decision.integration-spec.ts`                                                                                                                                                                                                                                                                                                                | chờ; Super Admin nhận một `CONTROLLED_WAIT_ALERT` (`SUBSCRIPTION_RENEWAL`); 403 cho người khác, `C2` quyết; tới hạn chót không ai quyết ⟹ áp `US-11-04` như hiện hành                                                                                                                                     | planned                  |
| `D-S16`, M7 — một cảnh báo mỗi đoạn chờ          | gửi phiên bản khi chưa ai giữ vai; thu hồi `C1` khi còn `SENT`; `C1` nghỉ việc (`EMPLOYEE_LEFT`) khi còn mục gia hạn chờ; listener nghe hai lần; gán lại rồi thu hồi lần hai                                                                                                        | unit `src/modules/notifications/inbox/inbox.policy.spec.ts`; integration `budget-version-history.integration-spec.ts`, `subscription-renewal-decision.integration-spec.ts`, `request-status-notifications.integration-spec.ts`                                                                                                                                                                            | đúng một notice mỗi nguồn (`eventKey` theo nguồn); nghe hai lần không thêm; đoạn chờ mới ⟹ notice mới; khóa số tiền bị từ chối; `IN_APP_NOTIFICATION_CODES` không đổi                                                                                                                                     | planned                  |
| US-12-15 AC-25 (dòng 35)                         | cờ role-duties khi người giữ vai rời đi                                                                                                                                                                                                                                             | integration `test/integration/personnel/role-duties.integration-spec.ts`                                                                                                                                                                                                                                                                                                                                  | chỉ còn `SPENDING_APPROVER`                                                                                                                                                                                                                                                                               | planned                  |
| Gỡ route, facade, gate (M3)                      | `GET/PUT /approval-roles` ⟹ 404; inventory; extension wiring; không đọc `approval_role_holders` ngoài repo preflight                                                                                                                                                                | http `test/http/platform/api-inventory.http-spec.ts`; gate `test/gates/extension-wiring.gate-spec.ts`, `test/gates/architecture-boundaries.gate-spec.ts`; xóa `test/http/identity-access/approval-roles.http-spec.ts`, `test/integration/identity-access/approval-roles-http.integration-spec.ts`, `test/integration/requests/spend-substitute.integration-spec.ts` (chuyển ca còn ý nghĩa sang file mới) | inventory không còn hai operation; gate xanh                                                                                                                                                                                                                                                              | planned                  |
| M5 — đường lui                                   | CSDL có dòng cause mới / lý do chờ mới; image trước Phase A                                                                                                                                                                                                                         | unit `src/modules/installation/public/recovery-target.policy.spec.ts`; integration preflight `--recovery-target` hiện có                                                                                                                                                                                                                                                                                  | nhãn Dockerfile = danh mục; image cũ ⟹ `INCOMPATIBLE` khi có dòng                                                                                                                                                                                                                                         | planned                  |
| Phase B migration                                | còn dòng chặn (i)–(iii) ⟹ `P0001` + `ops:preflight` exit 2; bước chờ `NO_DEPARTMENT_HEAD` dòng 4 không chặn; bước chi `PENDING` của người giữ grant đã thu hồi/đã nghỉ (có dòng grant) không chặn (iii); sạch ⟹ bảng/hàm/enum/trigger gỡ, trigger Super Admin vẫn chặn trưởng phòng | integration mới `test/integration/identity-access/drop-approval-role-holders-migration.integration-spec.ts`, `test/integration/identity-access/approval-role-holders-drop-preflight.integration-spec.ts`                                                                                                                                                                                                  | đúng như mô tả                                                                                                                                                                                                                                                                                            | planned                  |
| Hành trình                                       | phòng thiếu trưởng phòng → chờ → gán trưởng phòng → duyệt nhu cầu → lô → bước chi Người duyệt chi                                                                                                                                                                                   | e2e `test/e2e/paid-request-to-seat.e2e-spec.ts` (thêm nhánh) hoặc file e2e mới                                                                                                                                                                                                                                                                                                                            | đi hết chuỗi, không người thay thế                                                                                                                                                                                                                                                                        | planned                  |

Test phải cập nhật vì chạm hai vai/kiểu (grep `approval_role_holders|approvalRole|FALLBACK_APPROVER|CONFLICT_SUBSTITUTE|NO_FALLBACK_APPROVER|FALLBACK_IS_REQUESTER|NO_CONFLICT_SUBSTITUTE|conflictSubstitute|fallbackApprover|deciderRole`
trên `test/` ở `1a77ffe8`; vế Người duyệt chi đã do roles đổi): integration `audit/access-request-http`,
`audit/access-request-need-decision`, `budgets/budget-version-history`,
`installation/{dev-seed,inspect,installation-bootstrap-facts,installation}`, `licensing/subscription-renewal-decision`,
`notifications/step-sla`, `organization/{budget-notices,organization-identity-read-contracts}`, `personnel/role-duties`,
`requests/{access-request-internal-path,access-request-new-software,access-request-preview,assessment-queue,controlled-wait,group-request-edge,mobile-spend-approval,need-decision-queue-handover,request-status-notifications,spend-batches,spend-decision-constraints,spend-need-decision,spend-review-flows,spend-routing,step-reassignment-constraints,step-reassignment}`;
http `platform/openapi-presentation`, `platform/openapi-read-wording`, `requests/need-decision-queue`; e2e
`mobile-approver-journey`, `paid-request-to-seat`; gate `api-collection-contract`, `architecture-boundaries`, `extension-wiring`,
`module-graph`; support `reassignment-harness.ts`, `request-harness.ts`, `spend-harness.ts`, `group-harness.ts`,
`builders/organization.builder.ts`, `api-collection-registry{,-exceptions,-nested}.ts`, `api-coverage-manifest.ts`,
`openapi-example-manifest.ts`, `openapi-example-route-codes-{identity-access,requests,requests-spend,licensing}.ts`.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI (ví dụ
      `OPENAPI-EXAMPLE.1` đúng mã từng route).
- [ ] Hợp đồng `D-S21` (mã, `details`, `blockedBy`, thứ tự phán định) đúng như spec để `qd93-unplaced-employee-first-placement`
      chỉ thêm nhánh `UNPLACED`.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (lệnh chuyển đổi và thứ tự chạy sau deploy, preflight, demo dataset);
      phần chưa kiểm chứng ghi rõ.
- [ ] Không còn `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`, `getApprovalRoleHolders` trong `src/` ngoài giá trị lịch sử đã ghi
      ở `### Lịch sử và giá trị cũ`; không đọc `approval_role_holders` ngoài repo preflight (gate); spec cũ bị thay một phần có
      ghi chú _superseded_.

## Changes and acceptance

- 01/11/2026: bản thiết kế đầu (AI theo giao việc của Owner) từ Docs `69e8a3d`, BE `1a77ffe8`. Chưa Owner review, chưa
  implement, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OD-1 → OD-7, tên lệnh `pnpm ops:approval-role-conversion`); thiết kế vẫn
  draft chờ Owner review toàn spec. OD-4 chốt theo `QĐ-93d`(1) `D-S16` (Docs chưa commit lúc ghi): mở rộng cảnh báo dòng 27
  (`CONTROLLED_WAIT_ALERT`) cho phiên bản ngân sách và quyết định gia hạn, không loại cảnh báo mới. Pre-check cảnh báo dòng 9
  giữ ở plan (rà đọc BE `1a77ffe8` chưa thấy thông báo dòng 9 cho mọi ca mất trưởng phòng).
- 01/11/2026 — sửa sau audit độc lập, áp `D-S20`…`D-S23`, `D-S26` (Owner 01/11/2026, Docs chưa commit), đối chiếu code
  `1a77ffe8`: B1 — thêm `REWAIT`, guard Phase B theo `state` (bỏ literal `OPEN`), `DRAFT` khỏi (i), dòng 4 của bước chờ giữ (OD-1);
  H1 — bỏ đường _thêm người_ của hồ sơ bổ sung (`D-S23`); H2 — đóng băng bước cũ, 409 `STEP_AWAITING_CONVERSION`, trigger
  `QD93_CONVERSION`, lệnh chạy **sau** khi bản mới lên (không chèn giữa migrate và khởi động như audit đề xuất: API cũ vẫn phục
  vụ lúc migrate nên chỗ đó không đóng được cửa sổ); H3 — mô hình người thực hiện `OPERATOR` + tài khoản đứng tên, cause mới
  ở `licensing`, chính sách task `IN_PROGRESS`/`COMPLETED`, SQL hai ràng buộc; H4 — tạo thay tất cả hoặc không, 422 chung
  (`D-S22`); H5 — đường `responsibleEmployeeId` của `POST /provisioning-tasks`, `licensing` vào ownership, responsible-changes
  ngoài phạm vi; M1 — `D-S20` thay pre-check; M2 — `blockedBy`; M3 — inventory người tiêu dùng + gate; M4 — hợp đồng lệnh ghi;
  M5 — hai dạng dữ liệu đường lui; M6 — khóa grant `FOR SHARE`; M7 — ba nguồn cảnh báo + `eventKey`; LOW — tên hàm trigger,
  hàm mồ côi, đường dẫn `group-request/`, spec preflight mới, người nhận cảnh báo không rỗng, OD-7 đã ghi, nháp nhóm chặn dòng, bộ
  chọn của tạo thay là `groupRequestCandidateList`. OD-2 thay bởi `D-S21`. Hạng mục **sở hữu** hợp đồng `D-S21`.
- 02/11/2026 — sửa theo review vòng 2 (đối chiếu code `1a77ffe8`, không phát hiện nào bị bác): **B** luật bước chi cũ đổi từ
  "người giữ ≠ người giữ grant hiện tại" (listener `ApprovalRoleChange` đọc sau `UPDATE revoked_at` trong cùng transaction nên
  mọi thu hồi/chuyển vai làm bước chi đóng băng, 409, guard (iii) chặn mãi) sang "người giữ chưa từng có dòng grant
  `SPENDING_APPROVER`" — facade `everHeldSpendingApproverAmong`, áp đồng nhất cho sweep/listener, 409, bước 3 của lệnh chuyển đổi
  và guard (iii); thêm dòng test _B (vòng 2)_. **M** policy thuần `requestPartyBlock` chuyển vào `identity-access/request-party/`
  (một người dùng nội bộ ⟹ không ở `public/`, không đăng ký `PUBLIC_ROOT_POLICY_FILES`); hợp đồng chung chốt với hạng mục unplaced:
  `OrganizationReadApi.getUnplacedEmployeeIds` (dựa trên `EmployeeRepo.unplacedAmong`), kiểm trước mọi đọc phòng/Cost Center,
  thứ tự bên → lý do, không khóa nhân viên (khóa tài khoản `FOR SHARE` rồi mới đọc; theo từng người nhân viên → tài khoản; tạo
  thay dời khóa người thụ hưởng lên trước kiểm); `ineligibleAmong` trả `Map` lý do (dòng nhóm cần lý do, gửi nhóm khóa
  `FOR SHARE`); `groupRequestCandidateList` thêm vào bảng điểm gọi: người gọi là Người duyệt chi ⟹ 422 `REQUESTER`. **L**
  `request-party/` tiêm service `accounts/` đứng sau `lockSpendingApproverAmong`, không import `IdentityAccessApi`.
- 02/11/2026 — sửa theo rà soát pre-flight cuối: quy tắc migration không sửa `scripts/verify/merged-migrations.txt` trên
  nhánh hạng mục; dòng test _B (vòng 2)_ thu hồi `C2` (người đang giữ sau khi chuyển vai) trước khi gán cho `S`; Task 9
  sửa số operation (− 2, 299 theo thứ tự merge) và bỏ `identity-access/super-admin-transfer-http` khỏi danh sách chạy lại
  (tệp bị xóa ở `qd93-remove-in-app-super-admin-transfer`, W1).
