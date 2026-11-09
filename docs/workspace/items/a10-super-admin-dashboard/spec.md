# Spec: a10-super-admin-dashboard — trang tổng quan Super Admin (vận hành hệ thống và tổ chức)

- Phụ trách: AI implementer theo giao việc Dev A (`A-10`).
- Thiết kế ban đầu bởi: AI implementer theo [DEV-A A-10](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-7, _Sáu trang tổng quan_ Super Admin; `FR-2.1`, `FR-2.14`,
  `FR-3.17`, `QĐ-87a`), BE `6eb12d1` + diff `A-02`.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Khung chung và bảng phân rã: [a10-operational-dashboards](../a10-operational-dashboards/spec.md).

## Business outcome

Super Admin SA1 gọi `GET /api/v1/dashboards/super-admin` và thấy vận hành hệ thống/tổ chức: số phòng thiếu trưởng phòng, số phòng
thiếu IT Admin phụ trách dùng được (cùng phán đoán với cảnh báo phòng ban), số thông báo biến động nhân sự chờ xử lý; trỏ tới bảng
theo dõi nghẽn, cấu hình người duyệt, trạng thái vai Super Admin, hồ sơ có thể cấp tài khoản; "tác vụ nền" hiện rõ **chưa có
nguồn**. Không có nhóm Tổng chi, không mục seat hay duyệt.

## Sizing decision

- Container: G8 (`US-12-15`), Dev A `A-10`.
- Mode: `split-story`.
- Outcome and owner: trang Super Admin; module `dashboards`, capability `super-admin/`; số đếm qua `OrganizationApi.getOnboardingFacts`
  - `IdentityAccessApi.findUsableItAdminEmployeeIds` (facade hiện có) và `PersonnelDashboardApi.noticesAwaitingHandling`.
- Boundaries: chỉ đọc; một operation `GET /api/v1/dashboards/super-admin` (vai `SUPER_ADMIN`); không bảng, không migration.
- Not larger: định nghĩa và nguồn "tác vụ nền" chưa có (deferred `a10-background-jobs-board`).
- Not smaller: một vai, một lần đọc.
- Siblings: `a10-operational-dashboards`, `a10-manager-dashboard`, `a10-it-admin-dashboard`, `a10-background-jobs-board`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                      |
| ---------- | ---- | -------- | --------------------------------------- |
| `US-12-15` | AC-7 | partial  | tác vụ nền: `a10-background-jobs-board` |

Vế sở hữu: ghép trang; "cảnh báo vai trò" — phòng thiếu trưởng phòng, phòng thiếu IT Admin phụ trách (`COUNTED`,
`departmentWarningList`) và trạng thái vai Super Admin (`AT_SOURCE`, `superAdminWatchGet`); "thông báo biến động nhân sự chờ xử
lý" (`COUNTED`, `personnelNoticeList?status=PENDING_VERIFICATION`); "bảng theo dõi nghẽn" (`AT_SOURCE`, `stepCongestionList`);
"cấu hình người duyệt" (`AT_SOURCE`, `approvalRoleList`); "hồ sơ nhân viên mới chưa có tài khoản" (`AT_SOURCE`,
`accountCandidatesList`); vế phủ định "không có nhóm Tổng chi" (và không seat/duyệt).

## Supporting references

- `US-03-06` AC-9, AC-15 (cảnh báo phòng ban), `US-01-11`, `US-03-10`/`US-03-11` (BM-09), `US-05-10` (nghẽn), `US-01-03`
  (người duyệt), `US-03-04` AC-12/13 (vai Super Admin), `US-02-02` (hồ sơ mới).

## Explicit out of scope

- Đếm nghẽn/hồ sơ chưa có tài khoản/người duyệt thiếu: cần facade mới trong `requests` (Dev B) hoặc định nghĩa "hồ sơ mới"
  (danh sách `accountCandidatesList` là tìm kiếm) — để `AT_SOURCE`.
- Cảnh báo phòng thiếu trưởng phòng gửi Super Admin (dòng 9, 10 của danh mục — `A-03`/hộp thông báo).

## Dependencies and blockers

- Không migration. `PersonnelDashboardApi` từ `a10-manager-dashboard`.
- Câu hỏi Owner (chặn vế "tác vụ nền"): "tác vụ nền" là gì và đọc từ đâu (lỗi kết nối nhà cung cấp — G7; vòng job của worker —
  không có bảng ghi)? Default: `NOT_AVAILABLE` `NO_DATA_SOURCE`, giao `a10-background-jobs-board`.

## Ownership: module, data, API

- `dashboards/super-admin/` (controller, dto, service + spec). Personnel đếm `personnel_notices` `PENDING_VERIFICATION`.
- Operation thêm: `GET /api/v1/dashboards/super-admin` (`superAdminDashboardGet`, message `DASHBOARD.SUPER_ADMIN_RETRIEVED`).

## Behavior and design

`@RequireRoles('SUPER_ADMIN')` + service kiểm lại. Response: `asOf`, `sections`: `departmentsWithoutHead`,
`departmentsWithoutItAdmin`, `personnelNotices` (`COUNTED`); `congestion`, `approverConfiguration`, `superAdminRole`,
`accountCandidates` (`AT_SOURCE`); `backgroundJobs` (`NOT_AVAILABLE` `NO_DATA_SOURCE`). Phòng thiếu IT Admin = không ai được
nêu, người được nêu đã nghỉ, hoặc tài khoản không còn vai IT Admin dùng được (cùng luật `departmentWarningList`/onboarding).

## Test matrix

| AC / rủi ro                  | Tình huống                                                         | Cấp test         | Kết quả mong đợi                                                                                                | Bằng chứng                              |
| ---------------------------- | ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| AC-7 số đếm khớp nguồn       | P-HR không trưởng phòng/IT Admin; H1 gửi một thông báo nghỉ việc   | integration      | hai số phòng = số dòng `MISSING_HEAD`/`MISSING_IT_ADMIN` của `departmentWarningList`; thông báo = 1 = tổng list | `dashboards-http.integration-spec.ts`   |
| AC-7 luật IT Admin dùng được | IT Admin không dùng được / đã nghỉ / không có                      | unit             | ba phòng thiếu                                                                                                  | `super-admin-dashboard.service.spec.ts` |
| AC-7 không Tổng chi          | mọi lần đọc                                                        | unit+integration | không khóa `spending`/`spendQueue`/`grantTasks`/`needApprovals`; đúng tám khóa                                  | service spec + integration              |
| tác vụ nền                   | mọi lần đọc                                                        | unit+integration | `NOT_AVAILABLE` `NO_DATA_SOURCE`, `count` null                                                                  | service spec + integration              |
| role matrix                  | Employee, MANAGER, IT Admin, Finance, SPENDING_APPROVER, không vai | http+integration | 403; 401; 503                                                                                                   | http + integration                      |

## Definition of Done

- [x] Vế sở hữu có test; tác vụ nền không là 0.
- [x] Gate liên quan xanh (lệnh chung ở plan của umbrella).
- [x] Dòng roadmap và scope map G8 đã có trong `docs/roadmap.md`.
- [ ] Câu hỏi "tác vụ nền" chờ Owner.

## Changes and acceptance

- 31/10/2026: thiết kế và implementation đầu tiên (AI implementer; bằng chứng từ worktree cô lập tại `6eb12d1`). Chưa review, chưa nghiệm thu.
