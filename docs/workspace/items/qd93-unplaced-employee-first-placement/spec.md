# Spec: Nhân viên chưa xếp phòng và xếp phòng lần đầu (`QĐ-93g`)

- Phụ trách: chưa phân công (người/AI nhận implement sở hữu cả thiết kế, test và bằng chứng).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 `FR-2.1`, `FR-2.2`, `FR-9.7`, `INV-14b`, `INV-20`; User Stories regenerated — 143 Story /
  1 586 AC: `US-02-02` AC-2, AC-7, AC-14, AC-16, AC-20, AC-21; `US-02-03` AC-1, AC-2, AC-4, AC-8; `US-05-02` AC-14; vế _chưa
  xếp phòng_ của `US-01-01` AC-22, `US-03-02` AC-15, `US-03-06` AC-23, `US-05-01` AC-16, `US-05-03` AC-15, `US-05-17` AC-18,
  `US-05-21` AC-8; `US-03-01` AC-25; quyết định `QĐ-93g`(1)–(4), `QĐ-93f`(1), `D-S13`), BE `1a77ffe8`.
- Bổ sung sau pin: `QĐ-93d`(1) `D-S16`, `QĐ-93g`(5) `D-S14`, `QĐ-93j`(3) `D-S15`; D-S17…D-S26 (Docs chưa commit) — Owner
  01/11/2026, đã có trong `QĐ-93g` ở Docs working tree; `D-S27`, `D-S28` (Owner 01/11/2026, chưa có ở Docs); cập nhật pin khi
  Owner commit. Hạng mục này dùng `D-S14` (`US-03-04` AC-30, User Stories 1 587 AC, BRD `FR-2.2` câu _luồng rút gọn_), `D-S17`,
  `D-S18`, `D-S21`, `D-S22`, `D-S23`, `D-S25`, `D-S26`, `D-S27`, `D-S28`.
- Nhóm roadmap: G1, G2, G5, G6 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- [Kế hoạch](plan.md). [Test plan](test-plan.md) (từng route tạo Request theo hợp đồng `D-S21`, viết lại
  01/11/2026); `## Test matrix` dưới đây thắng khi lệch.

## Business outcome

Sau lát này Super Admin tạo được hồ sơ nhân viên **không** có phòng (nhập tay, hoặc dòng/file import không có mã phòng) —
hồ sơ ở trạng thái _chưa xếp phòng_ (không có dòng placement nào), không Cost Center, không ai được báo _có người mới_ — rồi
**xếp phòng lần đầu** bằng một thao tác riêng (phòng đang hoạt động, ngày hiệu lực không trước hôm nay và không trước ngày vào,
không căn cứ, không phải sự kiện nhân sự); nhân viên chưa xếp phòng không gửi hay là người thụ hưởng của Request nào (422
chung của `D-S21`, `details.reason = 'UNPLACED'`), không làm trưởng phòng/người kế nhiệm, không vào danh sách phòng nào, ghi
điều chuyển bị từ chối kèm lý do _chưa xếp phòng — dùng xếp phòng lần đầu_ (`US-03-01` AC-25); người đã xếp phòng lần đầu từ
ngày tương lai được coi là thành viên phòng đó khi xét Request (`D-S25`); đã xếp phòng thì không quay về _chưa xếp phòng_
(`INV-20`, có chốt ở CSDL); nhân viên chưa xếp phòng — hoặc mới chỉ có lần xếp phòng chưa hiệu lực mà ngày làm việc cuối
**trước** ngày hiệu lực đó — nghỉ việc được Super Admin ghi theo **luồng rút gọn** (có căn cứ, không nghĩa vụ trưởng phòng xác
nhận bàn giao ở bất kỳ bước nào, khóa tài khoản và thu hồi quyền/seat như luồng thường — `QĐ-93g`(5), `D-S18`; lần xếp phòng
chưa hiệu lực bị hủy trong cùng thao tác — `D-S17`, `D-S28`); ngày làm việc cuối từ ngày hiệu lực trở đi ⟹ giữ lần xếp phòng,
ghi nghỉ việc trước ngày đó bị từ chối kèm lý do, từ ngày đó đi luồng nghỉ việc thường (`D-S28`) — kiểm bằng unit, HTTP,
integration và migration test.

## Sizing decision

- Container: G1, G2, G5, G6 (nhóm giao việc, không phải ranh giới hạng mục) và gói quyết định `QĐ-93` (01/11/2026).
- Mode: `grouped-stories`.
- Outcome and owner: vòng đời _chưa xếp phòng → xếp phòng lần đầu_ (hoặc _chưa xếp phòng / xếp phòng chưa hiệu lực → nghỉ
  việc_) của một nhân viên; capability `organization/employee` (chủ vị từ _chưa xếp phòng_ dùng chung — `D-S25`), capability
  mới `organization/first-placement`, `data-import/employee-import` (dòng không phòng), nhánh `UNPLACED` của policy bên Request
  chung (`D-S21`, policy do `qd93-remove-fallback-substitute-approvers` sở hữu), đọc phòng theo điều kiện Request của
  `requests` + bộ chọn phần mềm của `catalog`, `personnel/offboarding` (nhánh rút gọn), `personnel/transfer` (lý do
  `US-03-01` AC-25) và `licensing/handover` (không nghĩa vụ trưởng phòng cho người nghỉ không phòng — `D-S18`).
- Boundaries: transaction tạo hồ sơ (không còn bắt buộc placement), transaction xếp phòng lần đầu (khóa phòng rồi nhân viên),
  transaction ghi nghỉ việc hiện có (nhánh không phòng: khóa nhân viên rồi tài khoản; nhánh xếp phòng chưa hiệu lực: thêm xóa
  placement đó sau khi ghi hồ sơ), hai migration (trigger `INV-20`; `offboarding_cases` cho hồ sơ không phòng và placement bị
  hủy, thay hàm trigger `INV-20`); HTTP mới `POST /employees/{id}/first-placements`; wire đổi của `employeeCreate`, import
  summary/result, hồ sơ nghỉ việc (`department` nullable), `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP` (`details.reason`), đường
  tạo Request (422 chung, preview `blockedBy`); quyền `SUPER_ADMIN` cho thao tác tổ chức và ghi nghỉ việc (giữ).
- Not larger: lọc _chưa xếp phòng_ trong danh bạ (`US-02-02` AC-22) thuộc `employee-directory-read` (dùng lại vị từ của lát
  này); format mã/`.xlsx` thuộc `qd93-code-format-xlsx-employee-import`; contract 422 chung, nhánh `SPENDING_APPROVER`, gộp
  lỗi tạo thay tất-cả-hoặc-không (`D-S22`) thuộc `qd93-remove-fallback-substitute-approvers`; vai `MANAGER` của `US-03-06`
  AC-23 thuộc `qd93-direct-manager-spending-approver-roles`; luồng nghỉ việc của người **đã** xếp phòng (bàn giao, trưởng
  phòng xác nhận, kế nhiệm) giữ ở các hạng mục nghỉ việc hiện có (`g6-offboarding-record`, `g6-handover-confirmation`).
- Not smaller: mọi Story ở đây áp **một** quy tắc (`QĐ-93g`(4): người _chưa xếp phòng_ không gửi, không thụ hưởng, không làm
  trưởng phòng/kế nhiệm, không điều chuyển) trên **một** dữ kiện ("có dòng placement nào chưa" — `D-S25`); tạo hồ sơ không
  phòng mà chưa có xếp phòng lần đầu, chưa chặn ở mọi cửa Request và chưa có lối nghỉ việc sẽ để hệ thống ở trạng thái người
  không phòng gửi được việc không ai chịu trách nhiệm hoặc không khóa được tài khoản. Bốn phase có checkpoint riêng (plan),
  phát hành chung một PR.
- Siblings: `qd93-remove-hr-basis-org-writes` (đi trước — cùng DTO/service), `qd93-remove-fallback-substitute-approvers`
  (đi trước — sở hữu policy bên Request chung), `qd93-code-format-xlsx-employee-import` (đi sau — chuẩn hóa mã phòng khi tra),
  `employee-directory-read` (đi sau — bộ lọc `unplaced` dùng vị từ của lát này),
  `qd93-direct-manager-spending-approver-roles` (chung các AC trộn hai vế).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1), [G2](../../../roadmap.md#work-item-decomposition-g2), [G5](../../../roadmap.md#work-item-decomposition-g5), [G6](../../../roadmap.md#work-item-decomposition-g6).

## Size exception

- Cohesion: một quyết định (`QĐ-93g`) và một dữ kiện (`EmployeeRepo.unplacedAmong` — không có dòng placement nào, `D-S25`)
  quyết mọi AC của bảng; sáu Story (`US-03-02`, `US-03-06`, `US-05-01`, `US-05-03`, `US-05-17`, `US-05-21`) chỉ góp **vế _chưa
  xếp phòng_** của AC mới viết theo `QĐ-93g`(4) — mỗi vế là cùng một kiểm tra ở một cửa tạo Request hay gán vai trò tổ chức.
  `US-03-04` AC-30 (`QĐ-93g`(5), `D-S17`, `D-S18`) là lối ra còn lại của cùng vòng đời (_chưa xếp phòng → nghỉ việc_) và
  `US-03-01` AC-25 là cửa điều chuyển của cùng trạng thái; cả hai dùng đúng dữ kiện đó để rẽ nhánh — ngoại lệ cỡ giữ ở đây theo
  giao việc của Owner 01/11/2026 (`D-S14`).
- Why not split: tách cửa Request ra hạng mục riêng sẽ phải merge trạng thái _chưa xếp phòng_ trước mà không có lớp chặn,
  tức có một khoảng thời gian hệ thống tạo được người không phòng và người đó gửi được Request; tách AC-30 ra thì giữa hai lần
  phát hành có người _chưa xếp phòng_ mà ghi nghỉ việc bị từ chối `OFFBOARDING_CASE.PLACEMENT_OVERLAP` (`NO_OPEN_PLACEMENT`) —
  không có cách nào khóa tài khoản và thu hồi quyền của họ qua luồng nghiệp vụ.
- Checkpoints: Phase A (CSDL + tạo hồ sơ không phòng), Phase B (xếp phòng lần đầu), Phase C (mọi cửa Request), Phase D (nghỉ
  việc rút gọn, `US-03-04` AC-30, `US-03-01` AC-25) trong [plan](plan.md). **A–D là một PR, merge một lần** (không merge
  phase lẻ lên `dev`): A tạo được người không phòng, C chặn họ ở Request, D cho họ lối nghỉ việc.
- Maximum scope: chỉ vế _chưa xếp phòng_ của các AC trong bảng, hai thao tác (tạo không phòng, xếp phòng lần đầu), nhánh rút
  gọn khi ghi nghỉ việc, lý do từ chối điều chuyển và nhánh `UNPLACED` của policy bên Request chung; **không** thêm vế Người
  duyệt chi, vai `MANAGER`, danh bạ, format mã, thao tác thêm người thụ hưởng (`D-S23`); **không** đổi luồng nghỉ việc của
  người đã xếp phòng (bàn giao, trưởng phòng xác nhận, kế nhiệm, thu hồi).
- Accepted by: Owner 01/11/2026 — duyệt thiết kế chia việc `QĐ-93` (Docs `69e8a3d`, _Người quyết_ của `QĐ-93`); `US-03-04`
  AC-30 (`D-S14`) giao vào hạng mục này theo giao việc cùng ngày; review toàn spec còn chờ.

## Primary Story/AC

| Story    | AC                                     | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                     |
| -------- | -------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-02 | AC-2, AC-7, AC-14, AC-16, AC-20, AC-21 | partial  | AC-14 vế căn cứ, AC-16 vế import/nhập tay/sửa, AC-1, AC-10, AC-13, AC-19: `qd93-remove-hr-basis-org-writes`; AC-14 vế mã, AC-23: `qd93-code-format-xlsx-employee-import`; AC-22, AC-24→AC-26: `employee-directory-read`; vế đã giao trước `QĐ-93`: `g2-employee-intake-by-super-admin` |
| US-02-03 | AC-1, AC-2, AC-4, AC-8                 | partial  | AC-1 vế đã giao: `g2-employee-intake-by-super-admin`; AC-7: `g2-department-profile`, `qd93-remove-hr-basis-org-writes`; AC-3, AC-5, AC-6: `g2-employee-import-preview-confirm` (giao trước GOV.1)                                                                                      |
| US-05-02 | AC-14                                  | partial  | AC-13: `qd93-remove-fallback-substitute-approvers`; AC-3, AC-5→AC-7, AC-9, AC-10, AC-12: `g5-request-submission-and-routing`; AC-1, AC-4, AC-11: `g5-request-amount-and-payment-schedule`; AC-2: `g5-group-requests`; AC-8: `g5-it-assessment-of-new-software`                         |
| US-01-01 | AC-22                                  | partial  | AC-4, AC-12, AC-16, AC-17, AC-21: `qd93-direct-manager-spending-approver-roles`; AC-13: `qd93-remove-in-app-super-admin-transfer`; AC còn lại giao trước GOV.1 ở `us-01-bootstrap-login-session`, `us-01-account-invitation-activation`                                                |
| US-03-02 | AC-15                                  | partial  | AC-15 vế Người duyệt chi và gộp lỗi tất-cả-hoặc-không (`D-S22`): `qd93-remove-fallback-substitute-approvers`; AC-1, AC-3→AC-14: `g5-delegated-requests`                                                                                                                                |
| US-03-06 | AC-23                                  | partial  | AC-23 vế vai `MANAGER`, AC-24: `qd93-direct-manager-spending-approver-roles`; AC-1, AC-22: `qd93-remove-hr-basis-org-writes`; AC-25: `qd93-code-format-xlsx-employee-import`; AC khác: `g2-department-profile`, `g2-g4-unit-only-cost-attribution`                                     |
| US-05-01 | AC-16                                  | partial  | AC-16 vế Người duyệt chi: `qd93-remove-fallback-substitute-approvers`; AC khác: `g5-request-preview`, `a01-employee-catalog-selector`                                                                                                                                                  |
| US-05-03 | AC-15                                  | partial  | AC-15 vế Người duyệt chi, AC-4: `qd93-remove-fallback-substitute-approvers`; AC khác: `g5-request-submission-and-routing`, `g5-delegated-requests`, `g5-group-requests`                                                                                                                |
| US-05-17 | AC-18                                  | partial  | AC-18 vế Người duyệt chi: `qd93-remove-fallback-substitute-approvers`; AC khác: `g5-group-requests`, `g5-commitment-lifecycle`                                                                                                                                                         |
| US-05-21 | AC-8                                   | partial  | AC-8 vế Người duyệt chi: `qd93-remove-fallback-substitute-approvers`; AC khác: `g5-service-account-request`                                                                                                                                                                            |
| US-03-04 | AC-30                                  | partial  | AC-30 làm trọn ở đây; AC-1→AC-29 (luồng nghỉ việc của người đã xếp phòng): `g6-offboarding-record`, `g6-leaver-role-and-workspace-duties`, `g6-service-account-handover`, `g6-leaver-request-closure`, `g6-downstream-integration`, `a05-k4-device-revocation`                         |
| US-03-01 | AC-25                                  | partial  | AC-25 làm trọn ở đây (lý do từ chối riêng + test); AC-1→AC-24: `g6-transfer-record` (AC-1 vế báo cáo: `g6-downstream-integration`; AC-9: `g6-service-account-handover`; AC-12: `g3-downstream-finance-integration`)                                                                    |

Vế sở hữu ở đây: `US-02-02` AC-14 — biểu mẫu không chọn phòng ⟹ _chưa xếp phòng_, phòng đã ngừng/chưa có ⟹ từ chối;
AC-16 — xếp phòng lần đầu không thu căn cứ; AC-2, AC-7, AC-20, AC-21, `US-02-03` AC-1, AC-2, AC-4, AC-8, `US-05-02` AC-14,
`US-01-01` AC-22, `US-03-04` AC-30, `US-03-01` AC-25 trọn AC; sáu AC còn lại chỉ **vế _chưa xếp phòng_** (người gửi/người
thụ hưởng/trưởng phòng là `E10`/`E302`). Dòng nào cũng `partial` vì Story có AC khác ở hạng mục khác (`US-03-04` AC-30 và
`US-03-01` AC-25 là `full` ở mức AC trong scope map, nhưng Story chia cho nhiều hạng mục nên coverage của Story ở đây là
`partial`).

Không còn claim: `US-06-14` AC-16 — `D-S23` bỏ thao tác thêm người thụ hưởng ở hồ sơ bổ sung (AC-16 viết lại, bỏ vế "thêm
`E3`/`E10`"), nên không còn vế _chưa xếp phòng_ nào; lát này không khóa hành vi `VALIDATION_ERROR` và không làm gì ở hồ sơ bổ
sung. Registry cần bỏ lát này khỏi _Remaining owner_ của dòng `US-06-14` AC-16 (01/11/2026).

## Supporting references

- `QĐ-93g`(1)–(5), `D-S13` (ngày hiệu lực không trước hôm nay, không trước ngày vào), Owner 01/11/2026 (`D-S17`) (xếp phòng
  chưa hiệu lực bị hủy khi nghỉ việc; người đang bàn giao không được xếp phòng lần đầu), Owner 01/11/2026 (`D-S28`) (`D-S17`
  chỉ áp khi ngày làm việc cuối **trước** ngày hiệu lực của lần xếp phòng; từ ngày đó trở đi giữ lần xếp phòng, ghi trước
  ngày đó bị từ chối, từ ngày đó đi luồng thường), Owner 01/11/2026 (`D-S27`) (duyệt mọi điểm kỹ thuật còn chờ của spec:
  hình bản xem trước của người chưa xếp phòng, khôi phục xếp phòng khi hủy hồ sơ và cờ `firstPlacementRestored`,
  `details.reason: 'UNPLACED'` ở hai lỗi có sẵn, `SQLSTATE 23001`), Owner 01/11/2026 (`D-S18`) (hồ sơ không phòng thuộc
  Super Admin và mọi IT Admin dùng được; không nghĩa vụ trưởng phòng xác nhận ở bất kỳ bước nào), Owner 01/11/2026 (`D-S21`,
  `D-S22`) (một contract từ chối bên Request), Owner 01/11/2026 (`D-S23`) (không thao tác thêm người ở hồ sơ bổ sung), Owner
  01/11/2026 (`D-S25`) (định nghĩa _chưa xếp phòng_), `QĐ-93f`(1), `QĐ-87b`(4) (IT Admin phụ trách nhận thông tin tối
  thiểu), `QĐ-66a` (trưởng phòng phải là thành viên), `QĐ-66ak` (thành viên từ lúc hồ sơ được ghi), `QĐ-68f`.
- Policy bên Request chung (`D-S21`): [qd93-remove-fallback-substitute-approvers](../qd93-remove-fallback-substitute-approvers/spec.md)
  sở hữu mã lỗi, hình dạng `details`, `blockedBy` của preview, bảng route và luật gộp tạo thay tất-cả-hoặc-không; lát này chỉ
  thêm nhánh `UNPLACED` vào cùng policy và test nó ở từng route.
  [qd93-direct-manager-spending-approver-roles](../qd93-direct-manager-spending-approver-roles/spec.md) — các AC trộn vế
  `MANAGER`.
- `US-03-06` AC-23 vế `E302` và `US-01-01` AC-22 vế "không làm trưởng phòng/kế nhiệm": đã đúng ở code
  (`NOT_A_MEMBER_ON_DATE`) — lát này thêm test. Lát vai (`qd93-direct-manager-spending-approver-roles`, merge trước) kiểm
  `DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED` **trước** thành viên, nên test cấp `MANAGER` cho tài khoản `E302` trước (điểm nối
  `ensureManagerGrant` của lát vai) để ra đúng `NOT_A_MEMBER_ON_DATE`; không `MANAGER` thì ra `HEAD_MANAGER_ROLE_REQUIRED`.
  `US-03-01` AC-25: code `1a77ffe8` đã từ chối nhưng với `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP` không `details`
  (`transfer-preconditions.service.ts:66-67`) — lát này thêm lý do riêng (Phase D) và nhận AC-25.
- Hạng mục bị **thay thế một phần**: [g2-job-title-catalogue-and-manual-employee](../g2-job-title-catalogue-and-manual-employee/spec.md)
  và [g2-employee-intake-by-super-admin](../g2-employee-intake-by-super-admin/spec.md) (vế "biểu mẫu thiếu phòng ⟹ từ
  chối", `DEPARTMENT_REQUIRED`), [g2-employee-import-preview-confirm](../g2-employee-import-preview-confirm/spec.md) (cột
  `department_code` bắt buộc), [foundation-org-identity-boundary](../foundation-org-identity-boundary/spec.md) (vế "mỗi lần
  tạo mở đúng một placement" của `createEmployeeWithPlacement`).
- Docs cần đọc lại khi implement: `US-02-02` AC-22 (working tree) còn câu "không còn trong bộ lọc này từ ngày hiệu lực" — lệch
  `D-S25` (bộ lọc theo "không có dòng placement nào"); chủ AC-22 là `employee-directory-read`, Docs agent viết lại.

## Explicit out of scope

- Bộ lọc _chưa xếp phòng_ của danh bạ (`US-02-02` AC-22): `employee-directory-read` (dùng `unplacedEmployeeSql` của lát
  này).
- Chuẩn hóa mã phòng (bỏ khoảng trắng, chữ hoa) khi tra: `qd93-code-format-xlsx-employee-import`; lát này giữ cách tra hiện
  hành (sau trim, khớp đúng).
- Contract 422 chung, nhánh `SPENDING_APPROVER`, luật gộp tạo thay, loại Người duyệt chi khỏi bộ chọn: `qd93-remove-fallback-substitute-approvers`;
  vai `MANAGER` gán trực tiếp (`QĐ-93a`): `qd93-direct-manager-spending-approver-roles`.
- Hồ sơ bổ sung sau khi Finance trả về: không có thao tác thêm người (`D-S23`) — không việc gì ở lát này.
- Luồng nghỉ việc của người **đã** xếp phòng và mọi bước sau khi ghi: giữ nguyên ở các hạng mục G6 hiện có; lát này chỉ thêm
  nhánh không phòng/xếp phòng chưa hiệu lực khi **ghi** nghỉ việc và để các bước sau (đổi ngày cuối, hủy, ghi _đã nghỉ việc_,
  khóa tài khoản, thu hồi, đóng hồ sơ, nhắc vai) chạy được với hồ sơ không phòng (`US-03-04` AC-30).
- Giới hạn trên cho ngày hiệu lực xếp phòng lần đầu: không có (`QĐ-93g`(3), `D-S13` chỉ đặt cận dưới; Owner duyệt 01/11/2026
  "không giới hạn trên"). Rủi ro đã biết: ngày tương lai xa do nhập nhầm không sửa được — không có thao tác hủy/sửa xếp phòng
  lần đầu (`D-S17` đã loại "thêm thao tác hủy xếp phòng"); người đó vẫn là thành viên phòng khi xét Request (`D-S25`) và vào
  danh sách phòng từ ngày đã nhập. Thêm cận trên cần quyết định nghiệp vụ mới — ngoài lát này.
- Import hiện trạng seat (IT Admin): giữ nguyên — seat cá nhân không cần phòng, seat tài khoản dịch vụ của người chưa xếp
  phòng lỗi `OWNING_DEPARTMENT_NOT_FOUND` như hôm nay (Owner duyệt 01/11/2026 — OQ-5).
- Tạo tài khoản và gán vai cho người chưa xếp phòng: đã không phụ thuộc placement (`account-invitation.service.ts`,
  `role-grant.service.ts`) — chỉ test chạy lại.
- `GET /departments/{id}/employees` và các đọc tổ chức khác (Cost Center suy ra, `INV-14b`): giữ theo placement hiệu lực tại
  ngày — `D-S25` chỉ áp cho điều kiện Request.

## Dependencies and blockers

- Thứ tự merge (gói `QĐ-93`, một hạng mục một lần, rebase lên `dev` trước merge): sau W1 `qd93-remove-hr-basis-org-writes`
  (cùng `employee.dto.ts`, `employee-manual.service.ts`, confirmation service) và W3 `qd93-remove-fallback-substitute-approvers`
  phase A (policy bên Request chung `D-S21` có trước; lát này thêm nhánh `UNPLACED`); merge A–D một PR ở W3 sau fallback A.
  Đi sau lát này: `qd93-code-format-xlsx-employee-import`, `employee-directory-read` (W4).
- Không chờ `QĐ-93a`: chặn trưởng phòng/kế nhiệm dựa vào thành viên phòng, đã có.
- `employee-directory-read` dùng **cùng** vị từ (`unplacedEmployeeSql` / `EmployeeRepo.unplacedAmong` — `D-S25`); lát này sở
  hữu vị từ.
- Các đề xuất có nhãn ở dưới và OQ-1 → OQ-5 đã được Owner duyệt 01/11/2026 (OQ-4 thay bằng `QĐ-93g`(5) `D-S14`); review toàn
  spec còn chờ.
- Phase D đọc lại `personnel/offboarding/*`, `personnel/transfer/*`, `licensing/handover/*` trên `dev` lúc bắt đầu vì các hạng
  mục G6 có thể đã đổi file.

## Ownership: module, data, API

- `organization/employee/`: `employee.dto.ts`, `employee-manual.service.ts`, `employee-row.policy.ts` (+ spec),
  `employee.repo.ts` (`createEmployee` thay `createEmployeeWithPlacement`; `unplacedAmong(ids, tx?)` và hàm xuất
  `unplacedEmployeeSql(employeeIdColumn)` — một `NOT EXISTS` dùng chung; `insertFirstPlacement`; `scheduledFirstPlacement`;
  `cancelScheduledFirstPlacement`, `restoreFirstPlacement`), `employee-record.service.ts`, `employees.controller.ts` (mô
  tả). `employee.repo.ts` 380 dòng ở `1a77ffe8`; lint `max-lines` 500 dòng code — vượt thì tách các hàm placement đầu
  (`insertFirstPlacement`, `scheduledFirstPlacement`, `cancelScheduledFirstPlacement`, `restoreFirstPlacement`) sang một
  repo cùng thư mục, giữ `unplacedEmployeeSql`/`unplacedAmong` ở `employee.repo.ts` (danh bạ gọi tên này).
- `organization/department/`: `department-record.service.ts`, `department.repo.ts` (`requestUnitsOn`, `requestMemberIdsOn` —
  placement hiệu lực tại ngày, hoặc lần xếp phòng lần đầu chưa hiệu lực; đếm người sẽ vào khi ngừng phòng).
- `organization/public/`: `organization.api.ts` (`createEmployee`, `cancelScheduledFirstPlacement`, `restoreFirstPlacement`),
  `organization.types.ts` (`CreateEmployeeInput`), `organization-read.api.ts` (`getUnplacedEmployeeIds`, `getRequestUnits`,
  `getRequestMemberIds`, `getScheduledFirstPlacement`), `employee-placement.policy.ts` (không đổi logic; chú thích).
- Capability mới `organization/first-placement/` (≤ 10 file): `first-placements.controller.ts`, `first-placement.dto.ts`,
  `first-placement.service.ts`, `first-placement.policy.ts` (+ spec), `first-placement.errors.ts`,
  `first-placement.http-errors.ts`, `first-placement-notice.mapper.ts` (+ spec). Đăng ký ở `organization-http.module.ts`.
  Không nhóm vào `employee/` vì thư mục đó đã 21/25 file.
- `organization/department-management/department.service.ts` (ngừng phòng đếm cả người sẽ vào từ ngày tương lai).
- `data-import/employee-import/`: `row-validation/employee-import-row-validation.policy.ts` (cột phòng tùy chọn, dòng
  trống phòng hợp lệ, so cột phòng theo `cells.department_code !== undefined`), `employee-import-row.types.ts`/
  `employee-import.types.ts` (`departmentId: string | null`), `preview/employee-import-preview.service.ts` (`newUnplaced`),
  `confirmation/employee-import-confirmation.service.ts` (`createdUnplaced`, `created` đếm đủ), `employee-import-summary.json.ts`,
  `employee-import-result.json.ts` (khóa mới mặc định 0 cho dòng cũ), `employee-import.dto.ts`,
  `employee-import-audit.mapper.ts`, `employee-import.http-errors.ts` (ví dụ `FILE_MISSING_COLUMNS` đổi sang
  `employee_code`), `employee-imports.controller.ts` (mô tả).
- `notifications/`: mã thông báo mới `EMPLOYEE_FIRST_PLACED` (`public/notifications.types.ts`, `inbox/inbox.policy.ts`
  params).
- `identity-access/request-party/` (của fallback): bước đọc `getUnplacedEmployeeIds` và nhánh `UNPLACED` của
  `requestPartyBlock`/`ineligibleReasons` — không đổi tên, vị trí gọi, thứ tự hay khóa.
- `requests/` và `catalog/requestable-software/`: đổi đọc phòng của các cửa Request sang `getRequestUnits`/`getRequestMemberIds`
  (sau lời gọi kiểm chung đã có); bản xem trước trả sớm khi `blockedBy.reason = 'UNPLACED'`; danh sách file ở plan Phase C.
- `installation/public/installation.api.ts`, `installation/public/dev-seed.api.ts` (gọi `createEmployee` với placement).
- `personnel/offboarding/` (Phase D): `offboarding-preconditions.service.ts`, `offboarding.policy.ts` (+ spec),
  `offboarding-endings.service.ts`, `offboarding-case-writer.service.ts`, `offboarding-handover.service.ts`,
  `offboarding-revocation.service.ts`, `offboarding.repo.ts`, `offboarding-list.repo.ts`, `offboarding-view.service.ts`,
  `offboarding-frame.service.ts`, `offboarding.mapper.ts`, `offboarding.dto.ts`, `offboarding.types.ts`,
  `offboarding.http-errors.ts`, `change/offboarding-change-judge.service.ts`, `change/offboarding-change-writer.service.ts`,
  `detail/offboarding-detail.service.ts`; `personnel/role-duties/role-duties.listener.ts`;
  `personnel/event-notice/personnel-notifier.service.ts` (`departmentId: string | null`); `personnel/transfer/`
  `transfer-preconditions.service.ts`, `transfer.http-errors.ts`, `transfers.controller.ts` (lý do `UNPLACED`).
- `licensing/provisioning/tasks/provisioning-holder.service.ts` (Phase C, `D-S25`): `problemWith` (dòng 113) đọc
  `getRequestUnits` thay `getOwningUnits` — người chịu trách nhiệm tài khoản dịch vụ đã xếp phòng lần đầu từ ngày tương lai ở
  đúng phòng của tài khoản không bị `OUTSIDE_DEPARTMENT`; kiểm chung của fallback vẫn đứng trước.
- `licensing/handover/` (Phase D, `D-S18`): `handover-confirmer.policy.ts` (+ spec), `handover.service.ts`,
  `handover-issue.service.ts`.
- Migration `<ts>_organization_placement_keep_one` (trigger) và `<ts>_personnel_offboarding_unplaced` (`offboarding_cases`,
  thay hàm trigger). `<ts>` theo quy tắc: implementer đặt timestamp thật khi tạo thư mục; trước merge đặt lại sau migration
  mới nhất trên `dev`; KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng
  nên gate `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành. Bảng: `employees`,
  `employee_placements` (ghi), `offboarding_cases` (ghi), `audit_events`, `notifications` (ghi).

## Behavior and design

### Định nghĩa dùng chung (`D-S25`)

- **Chưa xếp phòng** ⟺ nhân viên **không có dòng `employee_placements` nào** (hiện tại hay tương lai). Người đã nghỉ việc
  (placement đã đóng) **không** là _chưa xếp phòng_; người đã được xếp phòng lần đầu từ ngày tương lai **không** là _chưa xếp
  phòng_ — là thành viên của phòng đó khi xét điều kiện Request (như `QĐ-66ak`).
- **Một** vị từ: `unplacedEmployeeSql(employeeIdColumn)` (`Prisma.sql`, `NOT EXISTS (SELECT 1 FROM employee_placements p
WHERE p.employee_id = <col>)`) xuất từ `organization/employee/employee.repo.ts`; `EmployeeRepo.unplacedAmong(ids, tx?)` dùng
  nó, facade `OrganizationReadApi.getUnplacedEmployeeIds(ids: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>>` đọc
  qua repo — **tên duy nhất** mà policy bên Request chung gọi (chốt với `qd93-remove-fallback-substitute-approvers`, review vòng 2
  02/11/2026); chỉ trả nhân viên tồn tại (`FROM employees e WHERE e.id = ANY(…) AND <vị từ>`), không khóa dòng nào; bộ lọc
  `unplaced=true` của `employee-directory-read` (capability `organization/employee-directory`, import được
  `organization/employee`) dùng đúng hàm SQL này. Không tham số ngày.
- **Phòng theo điều kiện Request** (`D-S25`): `OrganizationReadApi.getRequestUnits(ids, onDate, tx?)` = placement hiệu lực
  tại `onDate`; không có ⟹ nếu mọi placement của người đó bắt đầu sau `onDate` (chỉ có thể là lần xếp phòng lần đầu) thì phòng
  của placement đó và Unit của nó. `getRequestMemberIds(departmentId, onDate)` = thành viên hiệu lực + người có lần xếp phòng
  lần đầu chưa hiệu lực ở phòng đó. `getOwningUnits`/`getDepartmentMemberIds` (licensing, budgets, seat-baseline, danh sách
  phòng) **không đổi** — trừ kiểm người chịu trách nhiệm khi IT Admin cấp tài khoản dịch vụ (`provisioning-holder.service.ts`
  `problemWith`): người đó là bên của Request (`D-S21`) nên đọc `getRequestUnits`.

### Tạo hồ sơ không phòng — nhập tay (`POST /api/v1/employees`)

- `departmentCode` vắng/`null`/rỗng sau trim ⟹ không tra phòng, không placement. Adapter `validateEmployeeRow` chỉ truyền
  `department` vào `placementReasons` khi có mã (policy dùng chung **không** đổi; `DEPARTMENT_REQUIRED` vẫn dùng cho đích
  điều chuyển). Có mã ⟹ như cũ: chưa có ⟹ `DEPARTMENT_NOT_FOUND`, đã ngừng ⟹ `DEPARTMENT_INACTIVE` (422
  `EMPLOYEE.ROW_INVALID`, `details.reasons`) — không bao giờ ghi thành _chưa xếp phòng_ (`US-02-03` AC-8, `US-02-02` AC-7).
- Ghi qua facade mới `OrganizationApi.createEmployee(tx, { …, placement: { departmentId, from } | null })` (thay
  `createEmployeeWithPlacement`; người gọi trong `src`: manual, import confirm, installation, dev-seed; người gọi trong test:
  `test/support/http-test-app.ts`, `test/support/builders/account.builder.ts`, `test/support/employee-import-service-harness.ts`,
  `test/integration/installation/installation-bootstrap-facts.integration-spec.ts`,
  `test/integration/organization/organization.integration-spec.ts` và ba unit spec cạnh service). Một writer duy nhất giữ nguyên.
- Response `EmployeeResponseDto` (đổi wire, FE): `memberSince: string | null`, `department: {id, code, name} | null`; thêm
  `unplaced: boolean` (Owner duyệt 01/11/2026 — dễ đọc cho FE). Audit `EMPLOYEE.CREATED` `after.department = null`,
  `after.memberSince = null`. Thông báo: không có (không phòng ⟹ không trưởng phòng/IT Admin — `profileNotices` đã trả rỗng;
  thêm test).

### Tạo hồ sơ không phòng — import

- `department_code` vào `OPTIONAL_COLUMNS` (bí danh giữ nguyên). File không có cột ⟹ mọi dòng người mới là _chưa xếp phòng_
  (`US-02-02` AC-2). Ô trống ⟹ dòng hợp lệ _chưa xếp phòng_ (`US-02-03` AC-1). Ô có mã chưa có/đã ngừng ⟹ lỗi dòng như cũ.
- Dòng của người **đã có**: cột phòng **vắng khỏi file** ⟹ không so cột này (Owner duyệt 01/11/2026 — OQ-3); cột có mặt ⟹ so
  như cũ (ô trống với người đã có phòng là _khác biệt_; mã với người _chưa xếp phòng_ là _khác biệt (mã phòng)_ và **không**
  xếp phòng — `US-02-02` AC-20 vế cuối). Cột có mặt hay không được suy từ **chính ô đã lưu**: `cells.department_code !==
undefined` (bộ đọc tệp chỉ đặt khóa cho cột có trong header — `employee-import-file.policy.ts:47-57`; ô trống là `''`).
  Không truyền header vào classifier: làm mới bản xem trước (`employee-import-preview.service.ts:115-128`) và xác nhận
  (`employee-import-confirmation.service.ts:134-140`) phân loại lại từ ô đã lưu, không có header — cùng hàm, cùng kết quả.
- Summary (`employee_imports.summary`, wire `summary`): thêm `newUnplaced: number` (người mới không phòng);
  `newPeopleByDepartment` chỉ gồm người có phòng. Result: thêm `createdUnplaced: number`; `created` = tổng người được tạo
  (sửa lỗi đang cộng chỉ theo phòng). Codec `.default(0)` cho dòng cũ. Audit `EMPLOYEE.CREATED` từ import `department: null`.
- Ví dụ lỗi `IMPORT.FILE_MISSING_COLUMNS` dùng `['employee_code']`; mô tả 422 bỏ "such as the department".

### Xếp phòng lần đầu — `POST /api/v1/employees/{id}/first-placements` (route Owner duyệt 01/11/2026 — OQ-1)

- Quyền: `@RequireRoles('SUPER_ADMIN')` + policy service (IT Admin, Finance, Manager, Employee ⟹ 403 `AUTHORIZATION.FORBIDDEN`).
- Body `z.strictObject({ departmentId: z.uuid(), effectiveFrom: businessDate })`. Chọn `departmentId` (FE chọn từ danh sách
  phòng); không nhận mã (Owner duyệt 01/11/2026).
- Thứ tự (giao thức khóa hiện hành: phòng trước, rồi nhân viên): `today = businessToday()`; khóa phòng `FOR SHARE` (không có ⟹
  422 `EMPLOYEE.FIRST_PLACEMENT_DEPARTMENT_NOT_FOUND`; không `ACTIVE` ⟹ 422
  `EMPLOYEE.FIRST_PLACEMENT_DEPARTMENT_INACTIVE`); khóa nhân viên `FOR UPDATE` (không có ⟹ 404 `EMPLOYEE.NOT_FOUND`); là
  hồ sơ của chính người gọi ⟹ 403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN` (mã hiện có); `status = TERMINATED` ⟹ 409
  `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEFT`; đang bàn giao vì đã ghi nghỉ việc (`workState = HANDING_OVER`) ⟹ 409
  `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING` (`D-S17`); đã có placement bất kỳ ⟹ 409
  `EMPLOYEE.FIRST_PLACEMENT_ALREADY_PLACED` (`details: { departmentCode, validFrom }` của placement đầu); `effectiveFrom <
today` ⟹ 422 `EMPLOYEE.FIRST_PLACEMENT_DATE_IN_PAST` (`details: { today }`); `effectiveFrom < hireDate` ⟹ 422
  `EMPLOYEE.FIRST_PLACEMENT_BEFORE_HIRE_DATE` (`details: { hireDate }`). Ngày tương lai không giới hạn trên (Owner duyệt
  01/11/2026; xem `## Explicit out of scope`). Ngày bằng hôm nay hợp lệ.
- Ghi: một dòng `employee_placements (department_id, valid_from = effectiveFrom, valid_to = NULL)`. Chốt cuối của CSDL:
  trigger `employee_placements_active_department` (`check_violation` ⟹ `DEPARTMENT_INACTIVE`), EXCLUDE
  `employee_placements_no_overlap` (`23P01` ⟹ `ALREADY_PLACED`).
- Không căn cứ, không sự kiện nhân sự, không `BM-04`, không `PLACEMENT_START` (announcement chỉ cho placement nối sau
  placement khác — `announcement.repo.ts:48-57`), không mở rà soát (`transfer-review.service.ts` coi placement đầu không phải
  điều chuyển), không tác vụ/khuyến nghị.
- Audit `EMPLOYEE.FIRST_PLACEMENT_RECORDED` (`resourceType: 'Employee'`): `before: { department: null }`, `after:
{ departmentId, department: code, effectiveFrom }`.
- Thông báo (mã mới `EMPLOYEE_FIRST_PLACED`, params `{ employeeId, departmentId, effectiveFrom }`, Owner duyệt 01/11/2026 —
  OQ-1): trưởng phòng có hiệu lực tại `effectiveFrom` (không có ⟹ trưởng phòng hôm nay; không có ⟹ bỏ), IT Admin phụ trách
  hiện hành (thông tin tối thiểu _có người mới_ — `QĐ-87b`(4)), và chính nhân viên khi đang làm việc (hộp thư hiện khi có tài
  khoản). Không ai nhận hai lần.
- Response 201 `{ employeeId, department: {id, code, name}, effectiveFrom }`, message `EMPLOYEE.FIRST_PLACEMENT_RECORDED`,
  operationId `employeeFirstPlacementCreate`.
- Từ lúc ghi (trước cả `effectiveFrom`): người đó **không còn** _chưa xếp phòng_ và là thành viên phòng khi xét Request
  (`getRequestUnits` — `D-S25`): tự gửi Request, trưởng phòng đó tạo thay, có trong `groupRequestCandidateList` của phòng đó;
  Request tính vào Unit của phòng đó, bước nhu cầu tới trưởng phòng hôm nay của phòng đó (thiếu ⟹ chờ có kiểm soát như mọi
  Request). Từ `effectiveFrom`: có trong `GET /departments/{id}/employees`, `technical-members`, Cost Center suy ra — các đọc
  này đã theo placement, không đổi code.

### `INV-20` — không quay về _chưa xếp phòng_

- Không có API nào bỏ phòng (PATCH hồ sơ đã từ chối khóa `department`).
- Đường code chạm placement đã rà (BE `1a77ffe8`): điều chuyển đóng/mở trong cùng transaction; hủy điều chuyển
  (`employee.repo.ts:209-216` `cancelStructureChange`) **xóa placement mới trước** rồi mở lại placement cũ — lúc xóa, placement
  cũ (đã đóng) vẫn còn nên không bao giờ là placement cuối; nghỉ việc đóng placement rồi chuyển `LEFT`; CLI dùng cùng service;
  `profile-correct` không chạm placement. Không đường nào để nhân viên còn làm việc không có placement nào — trừ đường hủy
  lần xếp phòng chưa hiệu lực khi ghi nghỉ việc (`D-S17`, Phase D) mà trigger cho phép có điều kiện.
- Chốt ở CSDL (migration riêng, task đầu tiên): trigger `BEFORE DELETE ... FOR EACH ROW` tên `employee_placements_keep_one`
  trên `employee_placements` — tên xếp **sau** `employee_placements_history_guard` (PostgreSQL chạy trigger cùng thời điểm
  theo thứ tự tên) để lỗi `55000` của guard lịch sử vẫn thắng khi cả hai cùng từ chối
  (`department-transfer-integrity.integration-spec.ts:68-70`). Hàm: khóa dòng nhân viên `FOR UPDATE` (hai lệnh xóa đồng thời
  hai placement cuối của một người tuần tự hóa; đường ứng dụng đã giữ khóa này nên không thêm chờ), rồi nếu không còn dòng
  khác của nhân viên (`NOT EXISTS ... id <> OLD.id`) ⟹ `RAISE ... USING ERRCODE = 'restrict_violation'` (`23001`, Owner
  01/11/2026 — `D-S27`),
  `CONSTRAINT = 'employee_placements_keep_one'`. **Không** dùng `23514` (`check_violation`): `TransferGuardService.guarded`,
  `OffboardingFrame.guarded` và `EmployeeRepo.scheduleStructureChange` ánh xạ mọi `23514` sang `CONCURRENT_CHANGE`/
  `DEPARTMENT_INACTIVE` — chốt `INV-20` mà bị chạm trên đường ứng dụng là lỗi lập trình, phải ra 500 thấy được, không được đội
  lốt lỗi nghiệp vụ. Không đổi trigger lịch sử hiện có. Phase D thay hàm (`CREATE OR REPLACE FUNCTION`) để thêm ngoại lệ hủy
  xếp phòng chưa hiệu lực (dưới).
- Ngừng phòng: kiểm _đang dùng_ đếm cả người có placement bắt đầu **sau hôm nay** ở phòng đó (đưa vào nhóm `members` của
  `DEPARTMENT.IN_USE`, cùng hình dạng) — tránh phòng bị ngừng trong khi có người sẽ vào (Owner duyệt 01/11/2026 — OQ-3).

### Từ chối Request của người _chưa xếp phòng_ (`US-05-02` AC-14) — nhánh `UNPLACED` của contract chung (`D-S21`)

- Contract (chủ: `qd93-remove-fallback-substitute-approvers`; lát này không định nghĩa lại): HTTP 422, **một** mã cho mọi
  route (đề xuất `REQUEST_PARTY.INELIGIBLE` — dùng đúng tên hạng mục chủ chốt), `details: { reason: 'SPENDING_APPROVER' |
'UNPLACED', party: 'REQUESTER' | 'BENEFICIARY', employeeIds: string[] }`; một người vừa là Người duyệt chi vừa chưa xếp
  phòng ⟹ báo `SPENDING_APPROVER`. Preview trả 200 `canSubmit: false` và `blockedBy: { reason, party, employeeIds } | null`.
  Lý do dòng nhóm dùng cùng giá trị `reason`. Thay toàn bộ thiết kế cũ (409 `ACCESS_REQUEST.EMPLOYEE_UNPLACED`,
  `RETURN_REQUEST.EMPLOYEE_UNPLACED`, 422 `DELEGATED_REQUEST.BENEFICIARY_UNPLACED`, lý do dòng `EMPLOYEE_UNPLACED`,
  `party: SENDER | RESPONSIBLE`) — Owner 01/11/2026 (`D-S21`) đã loại "giữ mã từ chối riêng theo từng thao tác".
- Nhánh `UNPLACED` — **trình tự chung** (chủ: spec fallback › _Hợp đồng từ chối bên của Request_; lát này không đổi tên, vị
  trí hay thứ tự): `RequestPartyEligibilityService` (`identity-access/request-party/`) (1) khóa `FOR SHARE` tài khoản các bên qua
  `lockSpendingApproverAmong` (chỉ `assertEligible` và `ineligibleAmong(…, { lockForShare: true })`), (2) gọi
  `OrganizationReadApi.getUnplacedEmployeeIds(mọi id các bên, tx)` — đọc **sau** khóa tài khoản, (3) phán định thuần
  (`requestPartyBlock` / `ineligibleReasons` ở `identity-access/request-party/request-party.policy.ts`): **bên trước** (`REQUESTER`
  rồi `BENEFICIARY`), **rồi lý do** trong bên (`SPENDING_APPROVER` rồi `UNPLACED`). Lát này chỉ cắm bước (2) và nhánh `UNPLACED`
  của hai hàm thuần.
- **Không khóa nhân viên** trong kiểm. Thứ tự khóa theo từng người giữ nhân viên → tài khoản: route nào khóa nhân viên (người gửi;
  người thụ hưởng của tạo thay; người chịu trách nhiệm ở cấp phát) khóa trước khi gọi kiểm. Đua với ghi nghỉ việc hủy lần xếp
  phòng chưa hiệu lực (`D-S17`; khóa nhân viên rồi tài khoản `FOR UPDATE`) tuần tự qua khóa nhân viên `FOR SHARE` đã có của route
  hoặc khóa tài khoản của bước (1), và bước (2) đọc sau khóa nên thấy placement đã hủy; xếp phòng lần đầu đồng thời chỉ biến
  _chưa xếp phòng_ thành đã xếp ⟹ cùng lắm từ chối thừa một lần, gửi lại được.
- **Vị trí:** kiểm chạy **trước mọi đọc phòng/Cost Center** của bất kỳ bên nào (`assess`/`assessProposal` với `getRequestUnits`,
  `headedDepartment` của tạo thay, `problemWith` của cấp phát, đọc phòng của gia hạn/hoàn trả, `getRequestUnits` của danh sách
  ứng viên), nên người _chưa xếp phòng_ không bao giờ rơi vào lỗi "không có phòng" cũ (`ACCESS_REQUEST.NO_DEPARTMENT`,
  `RETURN_REQUEST.NO_DEPARTMENT`, `DELEGATED_REQUEST.NOT_HEAD`/`OUTSIDE_DEPARTMENT`, `RENEWAL_REQUEST.OUTSIDE_DEPARTMENT`,
  `PROVISIONING.RESPONSIBLE_INVALID`); các lỗi đó giữ cho ca còn lại (người đã nghỉ việc, người ngoài phòng). Dòng nhóm: lý do
  `UNPLACED` đứng đầu thứ tự lý do của dòng (policy thuần), nên đọc phòng của dòng trước đó không làm lý do phòng ra trước.
- Bên (`party`) theo route: người gửi Request cá nhân/phần mềm mới/nội bộ/tài khoản dịch vụ, người gửi nháp, người gửi nhóm,
  người gọi danh sách ứng viên nhóm, người giữ seat tự gửi gia hạn/hoàn trả ⟹ `REQUESTER`; người được tạo thay, dòng nhóm,
  người giữ seat khi trưởng phòng gửi gia hạn, người chịu trách nhiệm tài khoản dịch vụ khác người gửi ⟹ `BENEFICIARY`.
- **Danh sách ứng viên nhóm** (`groupRequestCandidateList`, chốt chung với fallback): người gọi _chưa xếp phòng_ ⟹ 422 chung
  `{ reason: 'UNPLACED', party: 'REQUESTER', employeeIds: [người gọi] }` (`blockOf`, trước `getRequestUnits`; thay 409
  `ACCESS_REQUEST.NO_DEPARTMENT` hiện hành) — nhánh `SPENDING_APPROVER` của cùng chỗ do fallback làm; người đó không gửi được
  nhóm nên không có danh sách để chọn.
- **Bản xem trước** của người yêu cầu _chưa xếp phòng_ (Owner 01/11/2026 — `D-S27`; đổi wire): không có phòng để tính, nên
  preview **trả sớm, không gọi `assess`**, mỗi khi người yêu cầu thuộc tập _chưa xếp phòng_ mà bước kiểm chung đã đọc
  (`getUnplacedEmployeeIds`; tương đương: `ineligibleReasons` của bên `REQUESTER` có `UNPLACED`) — kể cả khi
  `blockedBy.reason = 'SPENDING_APPROVER'` vì người đó cũng là Người duyệt chi (lý do đó thắng theo thứ tự chung nhưng người
  đó vẫn không có phòng; gọi `assess` sẽ ra 409 `ACCESS_REQUEST.NO_DEPARTMENT`). Không quyết theo `blockedBy.reason`. Kết quả:
  200, `blockedBy` theo thứ tự chung (`{UNPLACED, REQUESTER, [người gọi]}`, hoặc `{SPENDING_APPROVER, REQUESTER, [người gọi]}`
  cho người vừa là Người duyệt chi), `canSubmit: false`; trường không phụ thuộc phòng (`plan`, `branch`, `termMonths`,
  `requirements`, `expectedSpendOn`) như thường; `department: null` (nullable mới — null **chỉ** khi người yêu cầu _chưa xếp
  phòng_), `costCenter`/`costEstimate`/`budgetYear`/`existingAccess` null, `pricing.status = 'NOT_APPLICABLE'`,
  `spendSubmission: 'NOT_NEEDED'`, `chain: []`, `possibleExtraSteps: []`, `totalExpectedWorkingDays: 0` (schema nới thành
  `nonnegative`). Đã loại: 409 `ACCESS_REQUEST.NO_DEPARTMENT` (trái `D-S21`: preview 200 + `blockedBy`).
- Tạo thay (`D-S22`): tất-cả-hoặc-không — có người thụ hưởng _chưa xếp phòng_ ⟹ cả lệnh bị từ chối, `employeeIds` liệt kê
  **mọi** người thụ hưởng có cùng cặp (bên, lý do) được báo — theo thứ tự chung, lệnh có cả Người duyệt chi lẫn người _chưa xếp
  phòng_ chỉ báo `SPENDING_APPROVER` với các Người duyệt chi (để `reason` đúng cho từng id); không Request nào được tạo.
- Bộ chọn người thụ hưởng (`groupRequestCandidateList`) đọc `getRequestMemberIds` ⟹ không có người _chưa xếp phòng_, có người
  đã xếp phòng lần đầu từ ngày tương lai (`D-S25`).
- Bộ chọn phần mềm (`catalog`, tầng dưới `requests`, không phải route tạo Request của `D-S21`): đọc `getRequestUnits`; người
  gọi _chưa xếp phòng_ ⟹ giữ 409 `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` và thêm `details: { reason: 'UNPLACED' }` (thêm trường,
  không mã mới — một mã một status; Owner 01/11/2026 — `D-S27`).
- Không Request, bước, cam kết hay Cost Center nào được tạo khi từ chối (kiểm số dòng trước/sau).

### Điều chuyển người _chưa xếp phòng_ (`US-03-01` AC-25)

- `TransferPreconditions.readBeforeLocks`: không có placement hiệu lực hôm nay ⟹ hỏi `getUnplacedEmployeeIds([id])`: _chưa
  xếp phòng_ ⟹ 409 `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP` `details: { reason: 'UNPLACED' }` (Owner 01/11/2026 — `D-S27`; mô
  tả: _nhân viên chưa xếp phòng — dùng xếp phòng lần đầu_, FE hiện lối sang `employeeFirstPlacementCreate`); ca khác (lần
  xếp phòng lần đầu chưa hiệu lực, người đã nghỉ) giữ 409 `PLACEMENT_OVERLAP` như hôm nay. Không mã mới; không giai đoạn nào
  mở, không `BM-04`, không rà soát. Sau xếp phòng lần đầu có hiệu lực, điều chuyển như AC-1 (căn cứ bắt buộc). Không có thao
  tác "rời phòng" không đích.

### Nghỉ việc của người _chưa xếp phòng_ — luồng rút gọn (`US-03-04` AC-30, `QĐ-93g`(5), `D-S14`, `D-S17`, `D-S18`)

Route, body và quyền giữ nguyên: `POST /api/v1/offboarding-cases` (`offboardingCaseRecord`; `lastWorkingDay`, `abrupt`,
`grounds`, `successor`, …), chỉ Super Admin, không tự ghi cho mình. BE `1a77ffe8` từ chối mọi người không có placement hiệu
lực hôm nay (`OffboardingPreconditions.readBeforeLocks` ⟹ 409 `OFFBOARDING_CASE.PLACEMENT_OVERLAP`
`details.reason = 'NO_OPEN_PLACEMENT'`). Thiết kế (01/11/2026; điểm kỹ thuật Owner duyệt 01/11/2026 — `D-S27`; nhánh hủy xếp
phòng của `D-S17` giới hạn bởi `D-S28`):

- **Rẽ nhánh** khi không có placement hiệu lực hôm nay:
  - _chưa xếp phòng_ (`getUnplacedEmployeeIds`) ⟹ **nhánh không phòng**;
  - chỉ có lần xếp phòng lần đầu chưa hiệu lực — `getScheduledFirstPlacement(employeeId, today)` trả
    `{ placementId, departmentId, validFrom }` — và ngày làm việc cuối (nghỉ đột xuất: ngày ghi) **trước** `validFrom` ⟹
    **nhánh không phòng + hủy lần xếp phòng đó** (`D-S17`, `D-S28`) — người đó không vào phòng;
  - chỉ có lần xếp phòng lần đầu chưa hiệu lực và ngày làm việc cuối **từ** `validFrom` trở đi ⟹ 409
    `OFFBOARDING_CASE.PLACEMENT_OVERLAP` `details: { reason: 'FIRST_PLACEMENT_PENDING', validFrom }` (Owner 01/11/2026 —
    `D-S28`): giữ lần xếp phòng, không ghi gì; mô tả cho FE: _nhân viên vào phòng từ `validFrom` — ghi nghỉ việc từ ngày đó
    (trưởng phòng của phòng đó xác nhận bàn giao) hoặc chọn ngày làm việc cuối trước ngày đó_. Từ `validFrom` placement đã
    hiệu lực ⟹ luồng nghỉ việc thường, không code mới;
  - còn lại ⟹ giữ `NO_OPEN_PLACEMENT`. Lý do `FIRST_PLACEMENT_SCHEDULED` của bản trước **bỏ**; `FIRST_PLACEMENT_PENDING` là
    giá trị `details.reason` mới của mã có sẵn (`D-S28`), không phải mã lỗi mới.
- **Kiểm như mọi lần ghi nghỉ việc**: `subjectRefusal` (`EMPLOYEE_NOT_FOUND`, `EMPLOYEE_LEFT`, `ALREADY_HANDING_OVER`,
  `LAST_WORKING_DAY_REQUIRED`); căn cứ bắt buộc (`QĐ-93f`(2)) ⟹ 422 `OFFBOARDING_CASE.GROUNDS_REQUIRED` /
  `GROUNDS_INCOMPLETE` / `GROUNDS_IS_NOTICE`; ngày cuối như luồng thường, mốc dưới là ngày vào làm thay cho ngày bắt đầu
  placement (`departureEffectiveOn`, `recordRefusal` nhận `placementFrom: BusinessDate | null`, `null` ⟹ dùng `hireDate`).
  Không mã lỗi mới.
- **Không có phần trưởng phòng**: `leavesAsHead = false`; `successor` xử lý như với người không làm trưởng phòng; không điều
  chuyển chờ và không là người kế nhiệm ⟹ hai kiểm đó rỗng.
- **Khóa**: nhánh hủy xếp phòng khóa phòng của placement đó `FOR SHARE` trước, rồi nhân viên `FOR UPDATE`, rồi tài khoản
  (`requireOperatorSubject`); nhánh không phòng bỏ phần phòng. Đọc lại sau khóa: trạng thái placement phải như lúc rẽ nhánh;
  vừa có xếp phòng lần đầu hay placement vừa hiệu lực ⟹ 409 `OFFBOARDING_CASE.CONCURRENT_CHANGE`.
- **Ghi** (`OffboardingEndings`, `OffboardingCaseWriter`): không kết thúc placement, không bàn giao trưởng phòng;
  `offboarding_cases.department_id = NULL`, `head_handover = NULL`; nhánh hủy ghi thêm `cancelled_placement_id`,
  `cancelled_placement_department_id`, `cancelled_placement_from` rồi **sau khi chèn hồ sơ** gọi
  `OrganizationApi.cancelScheduledFirstPlacement(tx, placementId)` (xóa dòng; audit `EMPLOYEE.FIRST_PLACEMENT_CANCELLED`
  `resourceType: 'Employee'`, `before: { departmentId, effectiveFrom }`, `after: { department: null }`, tham chiếu hồ sơ) —
  trước `leaveInTx` của nghỉ đột xuất. **Không** gọi `OffboardingHandoverService.open`. Nghỉ dài đang chạy kết thúc như thường;
  có kế hoạch ⟹ `workState = HANDING_OVER`, đột xuất ⟹ `LEFT` ngay. Audit như luồng thường (`department: null`).
- **Thông báo**: không trưởng phòng nào (`PersonnelNotifier`: `departmentId: string | null`, `null` bỏ khỏi tập phòng; params
  `departmentId: null`); thông báo vốn gửi IT Admin phụ trách phòng gửi IT Admin dùng được theo nhánh dự phòng đã có
  (`findFirstUsableItAdminEmployeeId`); nhánh hủy: `DEPARTURE_RECORDED` thêm trưởng phòng của phòng bị hủy qua
  `alsoDepartmentIds` (họ đã được báo `EMPLOYEE_FIRST_PLACED`; không mã thông báo mới). Người giữ vai cần người thay (ví dụ IT
  Admin chưa xếp phòng) ⟹ `ROLE_HOLDER_LEAVING` tới Super Admin như thường, `departmentId: null`.
- **Không nghĩa vụ trưởng phòng ở bất kỳ bước nào** (`D-S18`): `licensing/handover` — `requirementOf(facts, dataLoss,
{ departmentId })` bỏ mọi nguồn rời đi (`DEPARTURE`, `ABRUPT_DEPARTURE`) khi `departmentId` null ⟹ `HandoverService.open`
  và `openFromTask` (hook `RevocationListeners` lúc IT Admin mở thu hồi) không tạo `handover_duties`, `beforeWork` không ném
  `HandoverConfirmationPendingError` ⟹ tác vụ thu hồi bắt đầu ngay. `offboarding-revocation.service.ts` chỉ truyền
  `context.departmentId` khi có. Nguồn khác (IT, trả về) giữ nguyên.
- **Sau khi ghi — như luồng thường**: ghi _đã nghỉ việc_ (`offboardingCaseMarkLeft`), khóa tài khoản
  (`offboardingCaseRecordAccountLock`), IT Admin mở thu hồi (`offboardingCaseOpenRevocations`, `BM-08`), đóng hồ sơ — không
  đổi luật. Không tài khoản và không quyền nào ⟹ chỉ có sự kiện nghỉ việc, không tác vụ.
  - Đổi ngày cuối (`change/`): `placementFrom = null` ⟹ mốc `hireDate` (không phải `today`); không `periods.schedule`/`undo`,
    không đọc trưởng phòng khi `departmentId` null — hôm nay `scheduleDepartureEnd` không có placement ⟹ `PLACEMENT_OVERLAP`.
    Hồ sơ đã hủy một lần xếp phòng (`cancelled_placement_id` có): ngày cuối mới phải vẫn **trước** `cancelled_placement_from`;
    từ ngày đó trở đi ⟹ 409 `OFFBOARDING_CASE.PLACEMENT_OVERLAP` `details: { reason: 'FIRST_PLACEMENT_PENDING', validFrom }`
    (`D-S28`; muốn nghỉ từ ngày đó thì hủy hồ sơ — lần xếp phòng được khôi phục — rồi ghi lại theo luồng thường).
  - Hủy hồ sơ: `workState` về trạng thái trước; nhánh hủy xếp phòng **khôi phục** placement đã hủy (cùng id, phòng,
    `valid_from` — hoàn tác đúng như `periods.undo`) qua `OrganizationApi.restoreFirstPlacement` khi phòng đó còn `ACTIVE`
    (khóa `FOR SHARE`); phòng đã ngừng ⟹ không khôi phục, người đó ở _chưa xếp phòng_ và Super Admin xếp phòng lần đầu lại.
    Response của lệnh hủy có cờ `firstPlacementRestored: boolean` (chỉ với hồ sơ có `cancelled_placement_id`) và dòng
    `offboarding_case_changes` ghi `detail.firstPlacementRestored` cùng giá trị (Owner 01/11/2026 — `D-S27`).
  - Chi tiết hồ sơ (`detail/`): không gọi `getDepartmentBrief` khi `departmentId` null.
- **Phạm vi đọc** (`D-S18`): hồ sơ `department_id IS NULL` hiện cho Super Admin và **mọi IT Admin dùng được**
  (`OffboardingViewService.scopeOf`, `offboarding-list.repo.ts`); `offboarding-frame.service.ts` không khóa phòng khi
  `departmentId` null.
- **Migration** `<ts>_personnel_offboarding_unplaced`: `offboarding_cases.department_id` bỏ `NOT NULL` (FK giữ); cột
  `cancelled_placement_id uuid`, `cancelled_placement_department_id uuid` (FK `departments`), `cancelled_placement_from date`;
  CHECK `offboarding_cases_unplaced_no_head` (`department_id IS NOT NULL OR head_handover IS NULL`), CHECK
  `offboarding_cases_cancelled_placement` (ba cột cùng null hoặc cùng có, và có ⟹ `department_id IS NULL`); `CREATE OR
REPLACE FUNCTION` của `employee_placements_keep_one`: cho xóa placement cuối **chỉ khi** `OLD.valid_from` sau ngày nghiệp
  vụ hôm nay của tổ chức (`(now() AT TIME ZONE organizations.time_zone)::date`) **và** có hồ sơ nghỉ việc chưa hủy
  (`cancelled_at IS NULL`) của nhân viên đó với `cancelled_placement_id = OLD.id`. Rollback (SQL ghi trong PR): chỉ khi không
  còn dòng `department_id IS NULL`; khôi phục hàm trigger bản Phase A.
- **Wire** (FE): hồ sơ nghỉ việc (`offboardingCaseGet`, `offboardingCaseList`, response của các lệnh) có `department: null`;
  `OFFBOARDING_CASE.PLACEMENT_OVERLAP` thêm `details.reason: 'FIRST_PLACEMENT_PENDING'` (+ `validFrom`); response hủy hồ sơ
  thêm `firstPlacementRestored`; không route, không mã lỗi mới ở `OFFBOARDING_CASE.*`.
- Xếp phòng lần đầu cho người đang bàn giao (`workState = HANDING_OVER`) ⟹ 409 `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING`;
  đã `TERMINATED` ⟹ `FIRST_PLACEMENT_EMPLOYEE_LEFT` (`D-S17`).

### Không đổi

Quyền tạo hồ sơ/import (Super Admin); tài khoản và vai cho người chưa xếp phòng; chặn trưởng phòng/kế nhiệm
(`DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE`); định tuyến, Cost Center và quyền đọc của người đã xếp phòng; đọc tổ chức theo
placement hiệu lực.

### Concurrency

- Xếp phòng lần đầu: khóa phòng `FOR SHARE` rồi nhân viên `FOR UPDATE`; hai lần đồng thời cho cùng người ⟹ một thành công,
  một 409 `ALREADY_PLACED`; đồng thời với ngừng phòng (`FOR UPDATE` phòng) ⟹ tuần tự, bên sau thấy trạng thái mới (xếp phòng
  sau ⟹ 422 `DEPARTMENT_INACTIVE`; ngừng phòng sau ⟹ 409 `DEPARTMENT.IN_USE` liệt kê người sẽ vào).
- Tạo hồ sơ không phòng: không khóa phòng; trùng mã/email vẫn do chỉ mục duy nhất chốt.
- Xóa placement đồng thời: trigger khóa dòng nhân viên trước khi đếm ⟹ không thể cùng xóa hai placement cuối.
- Ghi nghỉ việc ↔ xếp phòng lần đầu cùng người: hai bên khóa nhân viên `FOR UPDATE` ⟹ tuần tự; ghi nghỉ việc trước ⟹ xếp
  phòng 409 `FIRST_PLACEMENT_EMPLOYEE_LEAVING`/`…_LEFT`; xếp phòng trước ⟹ ghi nghỉ việc đọc lại thấy placement ⟹ 409
  `CONCURRENT_CHANGE`.

### Tương thích

- Wire đổi: `employeeCreate` response (`memberSince`, `department` nullable; `unplaced` mới); import `summary.newUnplaced`,
  `result.createdUnplaced` (thêm); `FILE_MISSING_COLUMNS` không còn nêu `department_code`; route mới; mã thông báo mới;
  nhánh `UNPLACED` của 422 chung và `blockedBy`; `groupRequestCandidateList` của người gọi _chưa xếp phòng_ đổi từ 409
  `ACCESS_REQUEST.NO_DEPARTMENT` sang 422 `REQUEST_PARTY.INELIGIBLE`; bản xem trước của người _chưa xếp phòng_ có
  `department: null`, `totalExpectedWorkingDays: 0` (Owner 01/11/2026 — `D-S27`); `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` và
  `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP` thêm `details.reason`; `OFFBOARDING_CASE.PLACEMENT_OVERLAP` thêm
  `details.reason: 'FIRST_PLACEMENT_PENDING'` (`D-S28`); response hủy hồ sơ nghỉ việc thêm `firstPlacementRestored`; hồ sơ
  nghỉ việc `department` nullable. Không trường nào bị xóa.
- Dữ liệu cũ: mọi nhân viên hiện có đều có placement ⟹ không ai bị coi _chưa xếp phòng_ sau deploy; summary/result cũ đọc
  được (mặc định 0).

## Test matrix

| AC / rủi ro                                    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                          | Cấp test                                                                                 | Kết quả mong đợi                                                                                                                                                                                                                                                                                    | Bằng chứng sau implement |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `US-02-02` AC-14, AC-20                        | nhập tay `E302` không `departmentCode`                                                                                                                                                                                                                       | integration                                                                              | 201 `department: null`, `unplaced: true`; không placement, không thông báo; audit `department: null`                                                                                                                                                                                                | planned                  |
| `US-02-02` AC-14, AC-7; `US-02-03` AC-8        | nhập tay mã phòng chưa có / đã ngừng                                                                                                                                                                                                                         | integration                                                                              | 422 `EMPLOYEE.ROW_INVALID` `DEPARTMENT_NOT_FOUND`/`DEPARTMENT_INACTIVE`; không ghi                                                                                                                                                                                                                  | planned                  |
| `US-02-02` AC-2                                | file 12 dòng không có cột phòng                                                                                                                                                                                                                              | integration                                                                              | preview 12 hợp lệ, `newUnplaced: 12`; xác nhận ⟹ 12 người không placement                                                                                                                                                                                                                           | planned                  |
| `US-02-03` AC-1                                | file 50 dòng, dòng 17 trống phòng, dòng 18 trống chức vụ                                                                                                                                                                                                     | integration                                                                              | 50 hợp lệ; dòng 17 _chưa xếp phòng_; `created: 50`, `createdUnplaced: 1`                                                                                                                                                                                                                            | planned                  |
| `US-02-03` AC-8, `US-02-02` AC-7               | dòng mã phòng đã ngừng `P-OLD`                                                                                                                                                                                                                               | integration                                                                              | lỗi `DEPARTMENT_INACTIVE` ở cột `department_code`; không ghi; phòng không mở lại                                                                                                                                                                                                                    | planned                  |
| `US-02-03` AC-4                                | không có phòng/Cost Center "Chưa phân loại" sau import dòng trống phòng                                                                                                                                                                                      | integration                                                                              | không phòng/Cost Center nào được tạo                                                                                                                                                                                                                                                                | planned                  |
| `US-02-02` AC-20 vế cuối                       | import lại `E302` (chưa xếp phòng) với `P-DES`                                                                                                                                                                                                               | integration                                                                              | `EXISTS_DIFFERENT (department_code)`; không xếp phòng                                                                                                                                                                                                                                               | planned                  |
| OQ-3 cột vắng                                  | import lại người đã có phòng bằng file không cột phòng: preview, **làm mới** bản xem trước, **xác nhận**                                                                                                                                                     | unit + integration                                                                       | cả ba lần phân loại không báo khác biệt mã phòng; xác nhận không `PREVIEW_STALE`                                                                                                                                                                                                                    | planned                  |
| `US-02-02` AC-21                               | xếp `E302` (vào 01/10, hôm nay 03/10) vào `P-DES` từ 05/10                                                                                                                                                                                                   | integration                                                                              | 201; placement từ 05/10; audit trước/sau; thông báo `H1`, `IT1`, `E302`; không announcement/rà soát/tác vụ                                                                                                                                                                                          | planned                  |
| `US-02-02` AC-21                               | ngày 25/09 (trước ngày vào); 02/10 (trước hôm nay); phòng `P-OLD` đã ngừng; phòng không tồn tại                                                                                                                                                              | integration                                                                              | 422 `…BEFORE_HIRE_DATE` / `…DATE_IN_PAST` / `…DEPARTMENT_INACTIVE` / `…DEPARTMENT_NOT_FOUND`; vẫn _chưa xếp phòng_                                                                                                                                                                                  | planned                  |
| `US-02-02` AC-21                               | `E1` đã thuộc `P-DES`; `E302` đã được xếp từ tương lai rồi xếp lần hai                                                                                                                                                                                       | integration                                                                              | 409 `EMPLOYEE.FIRST_PLACEMENT_ALREADY_PLACED`                                                                                                                                                                                                                                                       | planned                  |
| `US-02-02` AC-21                               | IT Admin, Manager, Finance, Employee gọi; Super Admin xếp chính mình; id không tồn tại; body thừa khóa                                                                                                                                                       | http/integration                                                                         | 403 / 403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN` / 404 / 422 `VALIDATION_ERROR`                                                                                                                                                                                                                           | planned                  |
| `US-02-02` AC-16 vế xếp phòng                  | body xếp phòng kèm `hrBasis`                                                                                                                                                                                                                                 | http                                                                                     | 422 `VALIDATION_ERROR` (không có trường căn cứ)                                                                                                                                                                                                                                                     | planned                  |
| `US-02-03` AC-2, `INV-20`                      | xóa placement cuối bằng SQL; hai phiên cùng xóa hai placement của một người; hủy điều chuyển vẫn chạy                                                                                                                                                        | integration                                                                              | `23001` `employee_placements_keep_one`; phiên sau chờ rồi `23001`; hủy điều chuyển xanh (`department-transfer-change`); guard lịch sử vẫn `55000`                                                                                                                                                   | planned                  |
| `US-02-03` AC-2                                | sau import + xếp phòng: không ai có hai placement giao nhau; người chưa xếp phòng không Cost Center                                                                                                                                                          | integration                                                                              | `findPlacementCoverageViolations` (bản `INV-20` mới) rỗng; `getOwningUnits` không có người chưa xếp phòng                                                                                                                                                                                           | planned                  |
| `US-02-02` AC-20 (trưởng phòng)                | tài khoản `E302` được cấp `MANAGER` trước (lát vai kiểm `HEAD_MANAGER_ROLE_REQUIRED` trước thành viên); gán/chỉ định `E302` chưa xếp phòng làm trưởng phòng/kế nhiệm; đối chứng: `E303` không `MANAGER`                                                      | integration                                                                              | 422 `DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE`; đối chứng 422 `DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED`                                                                                                                                                                                                   | planned                  |
| `US-02-02` AC-20 (danh sách phòng)             | `H1` đọc `GET /departments/{id}/employees` trước/sau ngày hiệu lực                                                                                                                                                                                           | integration                                                                              | không có `E302` trước 05/10; có từ 05/10                                                                                                                                                                                                                                                            | planned                  |
| `US-02-02` AC-20 (tài khoản), `US-01-01` AC-22 | tạo tài khoản và gán `EMPLOYEE`/`IT_ADMIN` cho `E302`; sau đó xếp phòng lần đầu                                                                                                                                                                              | integration                                                                              | thành công như thường; tài khoản và vai không đổi sau xếp phòng                                                                                                                                                                                                                                     | planned                  |
| `US-05-02` AC-14                               | `E302` gửi từng loại Request (cá nhân, nháp lưu/gửi, đề xuất, nội bộ, tài khoản dịch vụ, gia hạn và hoàn trả của chính mình, nhóm)                                                                                                                           | integration                                                                              | 422 `REQUEST_PARTY.INELIGIBLE` `{reason: UNPLACED, party: REQUESTER, employeeIds: [E302]}`; không Request/bước/cam kết nào                                                                                                                                                                          | planned                  |
| `US-05-01` AC-16 vế chưa xếp phòng             | `E302` xem trước                                                                                                                                                                                                                                             | integration                                                                              | 200 `canSubmit: false`, `blockedBy: {UNPLACED, REQUESTER, [E302]}`, `department: null`, `chain: []`; không `ACCESS_REQUEST.NO_DEPARTMENT`                                                                                                                                                           | planned                  |
| preview trả sớm (`D-S27`)                      | `C2` giữ grant `SPENDING_APPROVER` và không có placement xem trước                                                                                                                                                                                           | integration                                                                              | 200 `canSubmit: false`, `blockedBy: {SPENDING_APPROVER, REQUESTER, [C2]}`, `department: null`, `chain: []`, `totalExpectedWorkingDays: 0`; `assess` không chạy, không 409 `ACCESS_REQUEST.NO_DEPARTMENT`                                                                                            | planned                  |
| thứ tự phán định và khóa (`D-S21`)             | `C2` giữ grant `SPENDING_APPROVER`, không placement, gửi `POST /access-requests`; `H1` tạo thay cho `E302` (chưa xếp phòng) và `C1` (Người duyệt chi); ghi nghỉ việc `E303` (ngày cuối trước ngày xếp phòng) song song `H1` tạo thay cho `E303` (hai thứ tự) | unit (`identity-access/request-party/request-party.policy.spec.ts`); integration         | `{SPENDING_APPROVER, REQUESTER, [C2]}`; tạo thay ⟹ `{SPENDING_APPROVER, BENEFICIARY, [C1]}` (lý do trước trong cùng bên); song song: không deadlock, nghỉ việc trước ⟹ 422 `{UNPLACED, BENEFICIARY, [E303]}`, tạo thay trước ⟹ 201, ghi nghỉ việc chạy sau khi tạo thay commit (chờ khóa nhân viên) | planned                  |
| `US-03-02` AC-15 vế chưa xếp phòng (`D-S22`)   | `H1` tạo thay cho `E302` và `E1` cùng lệnh; cho `E303` (giữ seat) gia hạn; IT Admin cấp phát với `responsibleEmployeeId = E302`                                                                                                                              | integration                                                                              | 422 `{UNPLACED, BENEFICIARY, [E302]}`, không Request nào (cả `E1`), không `OUTSIDE_DEPARTMENT`/`NOT_HEAD`; gia hạn ⟹ 422 `{UNPLACED, BENEFICIARY, [E303]}`; cấp phát ⟹ 422 `{UNPLACED, BENEFICIARY, [E302]}`, không `PROVISIONING.RESPONSIBLE_INVALID`                                              | planned                  |
| `US-05-17` AC-18 vế chưa xếp phòng             | `E1` kiểm/gửi nhóm có `E302`; `E1` mở danh sách ứng viên; `E302` mở danh sách ứng viên                                                                                                                                                                       | integration                                                                              | check: dòng `E302` lý do `UNPLACED` (đứng trước mọi lý do phòng của dòng); gửi bị từ chối theo policy chung, không Request; ứng viên không có `E302`; `E302` gọi ⟹ 422 `{UNPLACED, REQUESTER, [E302]}` (không còn 409 `ACCESS_REQUEST.NO_DEPARTMENT`)                                               | planned                  |
| `US-05-21` AC-8, `US-05-03` AC-15              | `E302` gửi Request tài khoản dịch vụ; Request có người chịu trách nhiệm `E302` khác người gửi                                                                                                                                                                | integration                                                                              | 422 `party: REQUESTER` / `party: BENEFICIARY`                                                                                                                                                                                                                                                       | planned                  |
| bộ chọn phần mềm                               | `E302` gọi `GET /requestable-applications`, `/requestable-plans/{id}`                                                                                                                                                                                        | integration                                                                              | 409 `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` `details.reason: UNPLACED`                                                                                                                                                                                                                                 | planned                  |
| `D-S25` (`QĐ-66ak`)                            | `E302` được xếp vào `P-DES` từ 05/10, hôm nay 03/10: `H1` tạo thay; `E302` tự gửi; `E1` mở ứng viên nhóm; `E302` mở bộ chọn                                                                                                                                  | integration                                                                              | 201 tính vào `CC-DES`, bước nhu cầu theo luật tạo thay/`H1`; ứng viên có `E302`; bộ chọn trả phần mềm của `P-DES`                                                                                                                                                                                   | planned                  |
| `D-S25` cấp phát                               | `E302` được xếp vào `P-DES` từ 05/10, hôm nay 03/10: IT Admin cấp tài khoản dịch vụ của `P-DES` với `responsibleEmployeeId = E302`                                                                                                                           | integration (`service-account-request.integration-spec.ts`)                              | cấp được như người của `P-DES`; không `PROVISIONING.RESPONSIBLE_INVALID` (`OUTSIDE_DEPARTMENT`)                                                                                                                                                                                                     | planned                  |
| `US-05-02` AC-14 vế cuối; ca cũ                | sau ngày hiệu lực `E302` gửi; `E9` đã nghỉ việc gửi                                                                                                                                                                                                          | integration                                                                              | 201 tới `H1`; `E9` lỗi cũ (`ACCESS_REQUEST.NO_DEPARTMENT` hoặc chặn tài khoản như hiện hành)                                                                                                                                                                                                        | planned                  |
| `US-03-01` AC-25                               | Super Admin ghi điều chuyển `E302` (chưa xếp phòng) sang `P-DES`; sau xếp phòng có hiệu lực, chuyển sang `P-FIN` kèm căn cứ                                                                                                                                  | integration                                                                              | 409 `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP` `details.reason: UNPLACED`, không giai đoạn/`BM-04`/rà soát; ca sau 201 như AC-1                                                                                                                                                                        | planned                  |
| rủi ro ngừng phòng                             | phòng có người xếp lần đầu từ ngày tương lai, Super Admin ngừng phòng; ngừng phòng và xếp phòng song song (hai thứ tự)                                                                                                                                       | integration                                                                              | 409 `DEPARTMENT.IN_USE` liệt kê người đó; song song: tuần tự, bên sau 422 `…DEPARTMENT_INACTIVE` hoặc 409 `IN_USE`                                                                                                                                                                                  | planned                  |
| rủi ro đồng thời                               | hai `POST first-placements` song song cho cùng người                                                                                                                                                                                                         | integration                                                                              | một 201, một 409; một placement                                                                                                                                                                                                                                                                     | planned                  |
| rủi ro dữ liệu cũ                              | summary/result import cũ không có khóa mới                                                                                                                                                                                                                   | unit                                                                                     | codec đọc được, mặc định 0                                                                                                                                                                                                                                                                          | planned                  |
| `US-03-04` AC-30 (ghi)                         | `E302` chưa xếp phòng, có tài khoản và seat Figma; Super Admin ghi nghỉ việc ngày cuối 30/11 kèm căn cứ                                                                                                                                                      | integration (`test/integration/personnel/offboarding-unplaced.integration-spec.ts`, mới) | 201; hồ sơ `department: null`, `HANDING_OVER`; không `handover_duties` nào; audit sự kiện                                                                                                                                                                                                           | planned                  |
| `US-03-04` AC-30 (sau ghi, `D-S18`)            | ghi _đã nghỉ việc_, khóa tài khoản; IT Admin không phụ trách phòng nào đọc hồ sơ, mở thu hồi seat Figma (gói mất dữ liệu)                                                                                                                                    | integration (cùng file)                                                                  | phiên `E302` bị từ chối từ request kế tiếp; tác vụ `BM-08` nhận/làm được **ngay** (không `HANDOVER_CONFIRMATION_PENDING`); hồ sơ đóng được                                                                                                                                                          | planned                  |
| `US-03-04` AC-30 (đổi ngày, hủy, vai)          | đổi ngày cuối hồ sơ không phòng (trước ngày vào ⟹ từ chối); hủy hồ sơ; IT Admin `A3` chưa xếp phòng nghỉ                                                                                                                                                     | integration                                                                              | đổi được, mốc `hireDate`; hủy ⟹ `workState` cũ; `ROLE_HOLDER_LEAVING` tới Super Admin với `departmentId: null`                                                                                                                                                                                      | planned                  |
| `US-03-04` AC-30 (căn cứ)                      | ghi nghỉ việc `E302` thiếu căn cứ / căn cứ thiếu phần / dùng mã thông báo làm căn cứ                                                                                                                                                                         | integration                                                                              | 422 `OFFBOARDING_CASE.GROUNDS_REQUIRED` / `GROUNDS_INCOMPLETE` / `GROUNDS_IS_NOTICE`; không hồ sơ nào                                                                                                                                                                                               | planned                  |
| `US-03-04` AC-30 (không tài khoản)             | `E304` chưa xếp phòng, không tài khoản, không quyền; ghi nghỉ việc đột xuất                                                                                                                                                                                  | integration                                                                              | chỉ sự kiện nghỉ việc (`LEFT`); không tác vụ; đóng được                                                                                                                                                                                                                                             | planned                  |
| `D-S17` xếp phòng chưa hiệu lực                | `E303` được xếp vào `P-DES` từ 20/11; hôm nay 05/11 Super Admin ghi nghỉ việc (có kế hoạch ngày cuối 15/11, rồi một ca đột xuất)                                                                                                                             | integration                                                                              | 201 `department: null`; placement bị xóa, hồ sơ giữ `cancelled_placement_*`; audit `EMPLOYEE.FIRST_PLACEMENT_CANCELLED`; `H1` nhận báo nghỉ việc                                                                                                                                                    | planned                  |
| `D-S17` hủy hồ sơ                              | hủy hồ sơ của `E303` khi `P-DES` còn hoạt động; ca khác `P-DES` đã ngừng trước khi hủy                                                                                                                                                                       | integration                                                                              | response `firstPlacementRestored: true`, placement khôi phục cùng id/phòng/ngày; ca phòng đã ngừng: không khôi phục, `firstPlacementRestored: false`, `E303` _chưa xếp phòng_                                                                                                                       | planned                  |
| `D-S17` xếp phòng khi đang bàn giao            | `E303` `HANDING_OVER`, Super Admin xếp phòng lần đầu                                                                                                                                                                                                         | integration                                                                              | 409 `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING`                                                                                                                                                                                                                                                     | planned                  |
| `D-S28` ngày cuối từ ngày xếp phòng            | `E305` được xếp vào `P-DES` từ 20/11; hôm nay 05/11 Super Admin ghi nghỉ việc ngày cuối 20/11, rồi 30/11; ngày 20/11 (`pretend-today`) ghi lại ngày cuối 30/11                                                                                               | unit (`offboarding.policy.spec.ts`: trước/bằng/sau `validFrom`) + integration            | 05/11: 409 `OFFBOARDING_CASE.PLACEMENT_OVERLAP` `details: {reason: FIRST_PLACEMENT_PENDING, validFrom: 2026-11-20}`, placement giữ, không hồ sơ/audit; 20/11: 201 luồng thường, `department` `P-DES`, `H1` có nghĩa vụ xác nhận bàn giao                                                            | planned                  |
| `D-S28` đổi ngày cuối                          | hồ sơ `E303` (đã hủy xếp phòng từ 20/11, ngày cuối 15/11): đổi ngày cuối sang 20/11; sang 18/11                                                                                                                                                              | integration                                                                              | 20/11 ⟹ 409 `PLACEMENT_OVERLAP` `FIRST_PLACEMENT_PENDING`, hồ sơ không đổi; 18/11 ⟹ đổi được                                                                                                                                                                                                        | planned                  |
| `INV-20` ngoại lệ có điều kiện                 | xóa bằng SQL placement chưa hiệu lực duy nhất khi không có hồ sơ nghỉ việc nêu nó; khi hồ sơ đã hủy                                                                                                                                                          | integration                                                                              | `23001` cả hai                                                                                                                                                                                                                                                                                      | planned                  |
| AC-30 mốc ngày                                 | ngày cuối trước ngày vào làm; người đã xếp phòng giữ mốc ngày bắt đầu placement                                                                                                                                                                              | unit (`offboarding.policy.spec.ts`, `offboarding-change.policy.spec.ts`)                 | `LAST_WORKING_DAY_INVALID` theo `hireDate` khi không placement; hành vi cũ giữ khi có placement                                                                                                                                                                                                     | planned                  |
| `D-S18` policy                                 | `requirementOf` nguồn `DEPARTURE`/`ABRUPT_DEPARTURE` có/không phòng; nguồn IT không phòng                                                                                                                                                                    | unit (`handover-confirmer.policy.spec.ts`)                                               | không phòng ⟹ null cho nguồn rời đi; nguồn IT giữ `IT_ADMIN`                                                                                                                                                                                                                                        | planned                  |
| rủi ro đồng thời nghỉ việc ↔ xếp phòng         | ghi nghỉ việc và xếp phòng lần đầu `E302` song song (cả hai thứ tự)                                                                                                                                                                                          | integration                                                                              | một bên thành công; bên kia 409 `CONCURRENT_CHANGE` hoặc `FIRST_PLACEMENT_EMPLOYEE_LEAVING`                                                                                                                                                                                                         | planned                  |
| hồi quy nghỉ việc người đã xếp phòng           | suite nghỉ việc và bàn giao hiện có                                                                                                                                                                                                                          | integration (`offboarding-departure`, `handover` hiện có — theo file)                    | xanh, không đổi                                                                                                                                                                                                                                                                                     | planned                  |
| migration hồ sơ không phòng                    | chèn hồ sơ `department_id NULL` kèm `head_handover`; `cancelled_placement_*` thiếu cột hoặc kèm `department_id`                                                                                                                                              | integration                                                                              | CHECK từ chối (`23514`)                                                                                                                                                                                                                                                                             | planned                  |

## Definition of Done

- [ ] Mọi primary AC có test đỏ-trước/xanh-sau ở cấp phù hợp; vế ở hạng mục khác ghi đúng.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối: `pnpm check`, HTTP/integration theo
      file đã sửa (`D-S26`); full `pnpm test:integration` và `pnpm test:e2e` chỉ sau khi Owner đồng ý.
- [ ] Spec/plan/test plan/roadmap phản ánh implementation cuối; FE được báo route mới, wire đổi, nhánh `UNPLACED`, mã thông
      báo mới.
- [ ] Không tăng legacy ledger kiến trúc; capability mới không tạo vòng (`pnpm arch:capabilities --module organization`).
- [ ] Module card `organization`, `data-import`, `requests`, `notifications`, `personnel`, `licensing` cập nhật; phần chưa kiểm
      chứng ghi rõ.

## Changes and acceptance

01/11/2026: lập theo giao việc Owner (gói `QĐ-93`, hạng mục 6). Chưa code, chưa review, chưa nghiệm thu.

- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OQ-1, OQ-2, OQ-3, OQ-5 và các nhãn đề xuất trong `## Behavior and design`:
  `unplaced`, không nhận mã phòng, ngày tương lai không giới hạn, `EMPLOYEE_FIRST_PLACED`, cột phòng vắng, ngừng phòng đếm
  người sẽ vào); thiết kế vẫn draft chờ Owner review toàn spec. Mã lỗi `*_UNPLACED` của OQ-2 sau đó bị `D-S21` thay.
- 01/11/2026 — OQ-4 thay bằng quyết định nghiệp vụ `QĐ-93g`(5) `D-S14`: thêm `US-03-04` AC-30 (nghỉ việc rút gọn) — Primary,
  `## Size exception`, Phase D của plan, test matrix; dòng `US-03-04` AC-30 thêm vào scope map G6.
- 01/11/2026 — sửa sau rà soát spec độc lập, theo Owner 01/11/2026 (`D-S17`, `D-S18`, `D-S21`, `D-S22`, `D-S23`, `D-S25`,
  `D-S26`): định nghĩa _chưa xếp phòng_ = không có dòng placement nào, xếp phòng lần đầu tương lai tính là thành viên khi xét
  Request (`getRequestUnits`), lát này sở hữu vị từ chung; mã `*_UNPLACED`/`SENDER` thay bằng nhánh `UNPLACED` của 422 chung
  và `blockedBy`; tạo thay tất-cả-hoặc-không; bỏ lý do `FIRST_PLACEMENT_SCHEDULED` — nghỉ việc trước ngày xếp phòng đi luồng
  rút gọn và hủy placement chưa hiệu lực (khôi phục khi hủy hồ sơ); `licensing/handover` không tạo nghĩa vụ trưởng phòng cho
  người nghỉ không phòng; thêm file Phase D (`change/`, `detail/`, `role-duties`, `PersonnelNotifier`,
  `offboarding-handover`, `offboarding-revocation`); bỏ claim `US-06-14` AC-16; nhận `US-03-01` AC-25 (lý do `UNPLACED`);
  trigger `INV-20` dùng `23001`, khóa nhân viên, tên sau guard lịch sử; so cột phòng theo ô đã lưu; viết lại
  `placement-coverage.ts`; A–D một PR. Registry cần đổi: `US-03-01` AC-25 sang `full` của lát này; bỏ lát này khỏi
  `US-06-14` AC-16.
- 02/11/2026 — chốt hợp đồng chung với `qd93-remove-fallback-substitute-approvers` (review vòng 2): một tên
  `OrganizationReadApi.getUnplacedEmployeeIds` (dựa trên `EmployeeRepo.unplacedAmong`, chỉ nhân viên tồn tại); kiểm chạy trước
  mọi đọc phòng/Cost Center; thứ tự bên (`REQUESTER` → `BENEFICIARY`) rồi lý do (`SPENDING_APPROVER` → `UNPLACED`); không khóa
  nhân viên trong kiểm (tài khoản `FOR SHARE` qua `lockSpendingApproverAmong` rồi mới đọc; theo từng người nhân viên → tài khoản);
  người gọi `groupRequestCandidateList` _chưa xếp phòng_ ⟹ 422 chung `REQUESTER` (bỏ ghi chú "chốt khi implement" ở test plan);
  đề xuất hình bản xem trước của người _chưa xếp phòng_ (`department: null` — Owner duyệt sau, `D-S27`); thêm dòng test thứ
  tự/khóa, cấp phát.
- 02/11/2026 — sửa theo rà soát pre-flight cuối và Owner 01/11/2026 (`D-S27`, `D-S28`): mọi điểm "chờ Owner" của spec đã
  duyệt (`D-S27`: hình bản xem trước, khôi phục xếp phòng khi hủy hồ sơ với cờ `firstPlacementRestored` ở response,
  `details.reason: 'UNPLACED'` ở hai lỗi có sẵn, `23001`); `D-S17` chỉ áp khi ngày làm việc cuối trước `validFrom`, ngày
  cuối từ `validFrom` ⟹ 409 `PLACEMENT_OVERLAP` `FIRST_PLACEMENT_PENDING` (+ `validFrom`), từ `validFrom` luồng thường
  (`D-S28`, Task D.2, D.3, hai dòng test); preview trả sớm theo tập _chưa xếp phòng_ của người yêu cầu, kể cả khi lý do báo
  là `SPENDING_APPROVER` (dòng test `C2`); bỏ `projectLabel` khỏi preview (đã gỡ ở `qd93-remove-department-projects` phase
  1); kiểm người chịu trách nhiệm khi cấp tài khoản dịch vụ đọc `getRequestUnits` (`provisioning-holder.service.ts`, Task
  C.3); test trưởng phòng `E302` cấp `MANAGER` trước; quy tắc migration không sửa `scripts/verify/merged-migrations.txt`;
  giới hạn 500 dòng của `employee.repo.ts`.

Quyết định kỹ thuật (Owner duyệt 01/11/2026):

- OQ-1 — route và body xếp phòng lần đầu `POST /employees/{id}/first-placements` với `departmentId`; mã thông báo mới
  `EMPLOYEE_FIRST_PLACED` và người nhận như `## Behavior and design`.
- OQ-2 — mã lỗi ở đường Request: **đã thay** bằng contract chung `D-S21` (Owner 01/11/2026).
- OQ-3 — import lại: cột phòng vắng khỏi file thì không so; ngừng phòng đếm người sẽ vào từ ngày tương lai.
- OQ-4 — đã thay bằng `QĐ-93g`(5) `D-S14` (nghiệp vụ, không phải đề xuất kỹ thuật): luồng rút gọn ở Phase D.
- OQ-5 — import hiện trạng seat với người chưa xếp phòng: giữ hành vi hiện tại.

Owner 01/11/2026 (`D-S27`) duyệt mọi điểm kỹ thuật trước đây còn chờ: khôi phục placement khi hủy hồ sơ (`D-S17`) và ca phòng
đã ngừng, cờ `firstPlacementRestored` ở response; `DEPARTURE_RECORDED` báo trưởng phòng của phòng bị hủy;
`details.reason: 'UNPLACED'` ở `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` và `DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP`; `SQLSTATE 23001`
cho trigger; hình bản xem trước của người _chưa xếp phòng_ (`department: null`, `chain: []`, `totalExpectedWorkingDays: 0`,
`blockedBy`). Owner 01/11/2026 (`D-S28`): nhánh hủy xếp phòng chỉ khi ngày cuối trước `validFrom`. Còn chờ: Owner review toàn
spec.

Scope map: các dòng đã có trong roadmap — G1 (`US-01-01` AC-22), G2 (`US-02-02` AC-2, AC-7, AC-20, AC-21; `US-02-03` AC-2,
AC-4, AC-8; Remaining owner của `US-02-03` AC-1, `US-03-06` AC-23), G5 (`US-05-02` AC-14; Remaining owner của các AC trộn với
`qd93-remove-fallback-substitute-approvers`), G6 (`US-03-04` AC-30). Cần registry đổi (không sửa ở lượt này): `US-03-01`
AC-25 `deferred` → `full`, owner lát này; `US-06-14` AC-16 bỏ lát này khỏi Remaining owner.
