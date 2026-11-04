# Spec: qd95-self-service-every-role — mọi tài khoản dùng được chức năng tự phục vụ (web và mobile)

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (04/11/2026), tách khỏi `qd95-one-role-per-account` sau review đối kháng;
  sửa theo disposition review 04/11/2026 (thêm Super Admin, `saasIssues`, `US-16-04` AC-5/AC-6).
- Thiết kế: `draft`. Owner review: chưa review toàn spec; quyết định ở `## Owner decisions` đã đóng 04/11/2026.
- Nguồn: Docs `0125072` + `QĐ-95` (BRD v3.60, US 1 666 AC — chưa commit lúc ghi; Owner commit trước khi implement rồi thay
  pin), BE `d7b8fe8d` (`dev`).
- Nhóm roadmap: G1, G8, G10 — chỉ là planning container (xem `## Sizing decision`).
- Hạng mục cùng đợt: [`ci-integration-shards`](../ci-integration-shards/spec.md) → **hạng mục này** (merge **trước**
  `qd95-one-role-per-account`) → [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md) →
  [`unified-seed-reset`](../unified-seed-reset/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Mọi tài khoản đã đăng nhập — bất kể vai — xem được "Phần mềm của tôi" (`GET /api/v1/me/software-rights`), "Yêu cầu của tôi"
(`GET /api/v1/me/access-requests`) và màn tổng quan nhân viên của chính mình (`GET /api/v1/dashboards/employee`), trên web và
mobile (`QĐ-95`d). Hôm nay hai route đầu/cuối đòi vai `EMPLOYEE` và route giữa trả 403 cho Super Admin, nên khi mỗi tài khoản
chỉ còn một vai, IT Admin, Finance, trưởng phòng, Người duyệt chi và Super Admin sẽ bị chặn. Gửi Request vẫn theo quy tắc hiện
hành (Super Admin, Người duyệt chi là bên của Request, nhân viên chưa xếp phòng bị từ chối); hoàn trả seat của Super Admin — hôm
nay lọt — cũng bị từ chối như mọi lần gửi. Kiểm bằng HTTP contract và integration.

## Sizing decision

- Container: G1, G8, G10 (yêu cầu trực tiếp của Owner 03/11/2026, việc 1 của đợt) — container giao việc, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: ranh giới quyền của các route tự phục vụ của chính người gọi; capability `licensing/my-software`,
  `requests/my-requests`, `dashboards/employee` (đọc số qua `requests/public/requests-dashboard.api.ts`).
- Boundaries: chỉ decorator truy cập và kiểm vai trong service của ba route đọc; không migration, không đổi dữ liệu trả về
  của người được phép hôm nay; không đổi route ghi nào.
- Not larger: một vai mỗi tài khoản (migration, đổi vai, recovery, `/me.selfServiceOnly`) là `qd95-one-role-per-account`.
- Not smaller: ba Story cùng một quy tắc (`QĐ-95`d) trên cùng ba route đọc, một test matrix; tách theo Story sẽ lặp cùng sửa
  decorator và cùng ma trận vai.
- Siblings: [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md),
  [`a09-mobile-auth-inbox-contract`](../a09-mobile-auth-inbox-contract/spec.md) (giữ `US-16-04` AC-1→AC-3).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1), [G8](../../../roadmap.md#work-item-decomposition-g8), [G10](../../../roadmap.md#work-item-decomposition-g10)

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                                  |
| -------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-01 | AC-25      | partial  | AC-2, AC-4, AC-7, AC-12→AC-14, AC-16→AC-18, AC-21, AC-23, AC-24: `qd95-one-role-per-account`; AC-22: `qd93-unplaced-employee-first-placement`; AC còn lại giao trước GOV.1 (G1 map) |
| US-12-15 | AC-27      | partial  | AC khác của Story thuộc các hạng mục G5/G8 khác (G8 map), ví dụ AC-25: `qd93-remove-fallback-substitute-approvers`                                                                  |
| US-16-04 | AC-5, AC-6 | partial  | AC-1→AC-3: `a09-mobile-auth-inbox-contract`; AC-4, AC-7: hành vi của ứng dụng native, không có phần BE (G10 map)                                                                    |

AC id theo Docs chưa commit (BRD v3.60, US 1 666 AC). `US-16-04` AC-5 trước đây là `DEF-A09-01` (deferred về `a09`) — hết đối
tượng theo `QĐ-95`d, nay thuộc hạng mục này; AC-6 tách khỏi `a09` (04/11/2026).

## Owner decisions

| Mã     | Nội dung                                                                                     | Trạng thái                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| OD-SS1 | Mỗi tài khoản đúng một vai ⟹ chức năng tự phục vụ mở cho mọi vai (`QĐ-95`a, `QĐ-95`d)        | **Đóng (Owner 04/11/2026)**                                                                                         |
| OD-SS2 | Super Admin xem "Yêu cầu của tôi" và màn tổng quan nhân viên; gửi Request vẫn bị từ chối     | **Đóng (Owner 04/11/2026, `US-01-01` AC-25, `US-12-15` AC-27)**: danh sách trả trang (thường rỗng), section đếm 0   |
| OD-SS3 | Bỏ `selfServiceOnly` khỏi `/me`; quyết định còn lại của đợt (một Super Admin, `DS1-ITOH`, …) | **Đóng (Owner 04/11/2026)** — ở [`qd95-one-role-per-account`](../qd95-one-role-per-account/spec.md#owner-decisions) |

## Supporting references

- `QĐ-95`d; `US-01-01` AC-25 (mọi vai dùng tự phục vụ; Super Admin không gửi Request, Người duyệt chi không là người yêu
  cầu/thụ hưởng, nhân viên _chưa xếp phòng_ không gửi Request), `US-12-15` AC-27, `US-16-04` AC-5, AC-6; `US-01-01` AC-17 (route
  chỉ Manager/IT giữ quy tắc vai — hồi quy).
- Code ở `d7b8fe8d`:
  - Chỉ hai route đòi vai `EMPLOYEE`: `@RequireRoles('EMPLOYEE')` ở `src/modules/licensing/my-software/my-software.controller.ts:28`
    và `src/modules/dashboards/employee/employee-dashboard.controller.ts:24`, cộng `assertHoldsRole(actor.roles, 'EMPLOYEE')` ở
    `employee-dashboard.service.ts:35` (grep `'EMPLOYEE'` trong `src/modules` không còn kiểm vai nào khác).
  - `GET /me/access-requests` trả 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` cho Super Admin (`my-requests.service.ts:47`,
    mô tả 403 ở `my-requests.controller.ts:40-45`); section `requests` của màn tổng quan trả `NOT_AVAILABLE`/`NO_DATA_SOURCE` vì
    `RequestsDashboardApi.openRequestsSentBy` trả `null` (`requests-dashboard.api.ts:25`).
  - Có 80 route `@AuthenticatedOnly()` trong `*.controller.ts`. Decorator này **chỉ** đòi đăng nhập: nhiều route trong số đó kiểm
    vai hay quan hệ trong service (ngân sách, Finance rà soát, duyệt chi, hàng đợi nhu cầu…) nên **không** có nghĩa là "mở cho mọi
    vai". Các route tự phục vụ ghi (gửi, rút, hoàn trả, báo lỗi SaaS, nháp) không đòi `EMPLOYEE`; chúng từ chối theo quy tắc
    nghiệp vụ (`mayRequest` — `access-request.policy.ts:58` — chặn Super Admin) — giữ nguyên. **Ngoại lệ:** hoàn trả seat
    (`returnRequestSubmit`, `return-request.service.ts:46-128`) **không** kiểm `mayRequest`, nên Super Admin giữ một seat (ví dụ
    có từ trước khi nhận vai qua `ops:recover`) hoàn trả được — trái vế _"`S1` gửi Request (kể cả hoàn trả) ⟹ từ chối"_ của
    `US-01-01` AC-25; danh sách của `super-admin-cannot-request.integration-spec.ts:30-110` không có thao tác này.
  - Section `saasIssues` của màn tổng quan đã đếm báo lỗi **người gọi gửi** còn mở (`reporterEmployeeId = người gọi`,
    `licensing/dashboard-facts/dashboard-facts.repo.ts:69-70`) cho mọi vai. Nhưng `saasIssueList` mà section trỏ tới có phạm vi
    mặc định `assigned` với IT Admin (`saas-issue-view.service.ts:84-86`; `saas-issues.controller.ts:120` mô tả) — FE của IT Admin
    phải gọi `scope=mine` để thấy đúng các dòng được đếm.
  - `dashboard-section.policy.ts:3-6`: section chỉ trả số khi đếm được trong phạm vi người gọi — giữ.

## Explicit out of scope

- Thay đổi dữ liệu của My software, "Yêu cầu của tôi" hay màn tổng quan; FE/mobile.
- Chính sách **gửi** Request của Super Admin/Người duyệt chi/nhân viên _chưa xếp phòng_ (đã có — chỉ chạy lại làm hồi quy), trừ
  hoàn trả của Super Admin (mục 6 của _Behavior and design_); danh sách nháp `GET /request-drafts` vẫn 403 với Super Admin (nháp là một phần của
  việc gửi — `request-draft.service.ts:98`).
- Một vai mỗi tài khoản, route đổi vai, bỏ `/me.selfServiceOnly` → `qd95-one-role-per-account`.

## Dependencies and blockers

- `QĐ-95` commit ở Docs (thay pin). Không phụ thuộc hạng mục BE nào.
- **Phải merge trước** `qd95-one-role-per-account`: nếu không, khi tạo tài khoản chỉ còn một vai, tài khoản chỉ `MANAGER` (và mọi
  vai khác `EMPLOYEE`) mất My software và màn tổng quan.

## Ownership: module, data, API

- `licensing/my-software` (`meSoftwareRightList`), `dashboards/employee` (`employeeDashboardGet`), `requests/my-requests`
  (`meAccessRequestList`), `requests/public/requests-dashboard.api.ts` (`openRequestsSentBy`), `requests/return-request`
  (`returnRequestSubmit`: thêm từ chối Super Admin).
- `dashboards/section/dashboard-section.policy.ts`: `DashboardRole` (dòng 50) bỏ `'EMPLOYEE'` (không còn người dùng).
- Không migration, không bảng mới. OpenAPI đổi ở bốn operation: ba route đọc bỏ phản hồi 403 và sửa mô tả;
  `returnRequestSubmit` thêm ví dụ 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`.

## Behavior and design

1. `my-software.controller.ts:28` và `employee-dashboard.controller.ts:24`: `@RequireRoles('EMPLOYEE')` → `@AuthenticatedOnly()`
   (import `AuthenticatedOnly` từ `infrastructure/security/decorators/access.decorators` như `my-requests.controller.ts:10`); bỏ khối
   `HttpStatus.FORBIDDEN` khỏi `@ApiErrorResponses` của hai route; mô tả nói "mọi tài khoản đã đăng nhập, chỉ về chính mình".
2. `employee-dashboard.service.ts:35`: bỏ `assertHoldsRole(actor.roles, 'EMPLOYEE')` và import thừa; sửa chú thích dòng 19-23.
3. "Yêu cầu của tôi" cho Super Admin: `my-requests.service.ts:45-47` bỏ kiểm `mayRequest` (bỏ import lỗi nếu thừa) — trả trang
   Request **chính người gọi đã gửi** như mọi người: Super Admin không gửi được nên thường là trang rỗng; Request gửi trước khi
   người đó nhận vai qua `ops:recover` vẫn hiện (đúng "yêu cầu của chính mình"). `my-requests.controller.ts:40-45` bỏ phản hồi
   403 và ví dụ; `test/support/openapi-example-route-codes-requests.ts:195` bỏ dòng `meAccessRequestList`.
4. Màn tổng quan: `requests-dashboard.api.ts` — `openRequestsSentBy` trả `Promise<number>`, bỏ nhánh `mayRequest` (dòng 25) và
   sửa chú thích lớp (dòng 7-12); `employee-dashboard.service.ts:47` → `requests: counted(openRequests, 'meAccessRequestList')`
   (Super Admin, Người duyệt chi: `COUNTED` 0). Bỏ import `notAvailable` nếu thừa.
5. `saasIssues`: giữ đếm theo `reporterEmployeeId = người gọi`; mô tả OpenAPI của `employeeDashboardGet` ghi rõ "báo lỗi người
   gọi đã gửi; danh sách tương ứng là `saasIssueList` với `scope=mine`".
6. Hoàn trả của Super Admin: `ReturnRequestService.submit` (`return-request.service.ts:46`) kiểm
   `if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError()` **trước** khi mở transaction (như
   `request-intake/access-request.service.ts:64`); `toReturnApiException` chuyển lỗi không phải của nó cho
   `toAccessRequestApiException` (`return-request.http-errors.ts:25-37`) ⟹ 403; `return-requests.controller.ts:51-53` thêm phản hồi 403 và ví dụ;
   `test/support/openapi-example-route-codes-requests.ts:237-238` thêm mã vào `'403'`.
7. Người gọi không có hồ sơ nhân viên hợp lệ: không tồn tại (mọi tài khoản gắn một nhân viên); nhân viên _chưa xếp phòng_ đọc được
   như mọi người (dữ liệu của chính mình).

Migration, transaction, collection API mới, jobs/storage: không áp dụng (ba route đọc giữ projection, paging và thứ tự hiện có).

## Test matrix

Tài khoản thử (tạo bằng harness hiện có, mỗi tài khoản **một** vai): `IT1` (`IT_ADMIN`), `F1` (`FINANCE`, `h.finance`), `H1`
(`MANAGER`, trưởng phòng), `M2` (`MANAGER`, không làm trưởng phòng), `U3` (`EMPLOYEE`), `C1` (`SPENDING_APPROVER`), `S1` (Super
Admin của seed), `E10` (`EMPLOYEE`, _chưa xếp phòng_ — `insertEmployeeWithoutPlacement` của `account.builder.ts`).

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                                                                                               | Cấp test                    | Kết quả mong đợi                                                                                                                            | Bằng chứng |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| US-01-01 AC-25 (xem)          | Tám tài khoản gọi `GET /me/software-rights`, `GET /me/access-requests`, `GET /dashboards/employee`, `GET /notifications`                                                          | http + integration          | 200, chỉ dữ liệu của chính người gọi; `S1`, `C1`: trang Request rỗng, section `requests` `COUNTED` 0                                        | planned    |
| US-01-01 AC-25 (làm)          | `IT1`, `F1`, `H1`, `M2`, `U3`: gửi Request cho chính mình, rút Request đó, hoàn trả seat của mình, báo lỗi SaaS cho quyền của mình                                                | integration                 | được nhận; Request của `H1` có bước nhu cầu giao Người duyệt chi (`QĐ-52c`); không bước nào do chính người đó duyệt                         | planned    |
| US-01-01 AC-25 (từ chối)      | `S1` gửi Request; `S1` giữ một seat rồi hoàn trả (`returnRequestSubmit`, mới); tạo Request có `C1` là người yêu cầu/thụ hưởng; `E10` gửi Request                                  | integration (suite hiện có) | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`; từ chối bằng mã hiện có của `QĐ-93d`, `QĐ-93g`; không ghi gì                               | planned    |
| US-12-15 AC-27                | `IT1` có một seat và một Request đang chờ của mình; `H1`, `C1`, `S1` mở màn tổng quan                                                                                             | http + integration          | 200; `IT1` thấy `softwareRights` ≥ 1, `requests` 1; không ai thấy dữ liệu người khác; màn theo vai (manager/it-admin/super-admin) không đổi | planned    |
| `saasIssues` (US-12-15 AC-27) | `IT1` gửi một báo lỗi; một báo lỗi khác của `U3` được giao cho `IT1`                                                                                                              | integration                 | màn tổng quan nhân viên của `IT1` đếm 1 (báo lỗi đã gửi); màn IT Admin của `IT1` vẫn đếm báo lỗi được giao                                  | planned    |
| US-16-04 AC-5                 | `IT1`, `F1`, `S1` với nhãn kênh mobile: `/me`, inbox, `/me/software-rights`, `/me/access-requests`, `/dashboards/employee`; `IT1`, `F1` gửi rồi rút; `S1` gửi; route của vai khác | integration                 | tự phục vụ 200; `IT1`, `F1` gửi/rút được; `S1` gửi 403 `SUPER_ADMIN_CANNOT_REQUEST`; route vai khác 403 như web                             | planned    |
| US-16-04 AC-6                 | `H1` (chỉ `MANAGER`) với nhãn mobile: hàng đợi nhu cầu (`US-16-02`), ba route tự phục vụ, gửi Request cho mình; vai của tài khoản đổi ở web rồi gọi lại bằng mobile               | integration                 | cùng vai hiệu lực như web; tự phục vụ 200 không cần `EMPLOYEE`; bước nhu cầu giao Người duyệt chi; đổi vai có hiệu lực ở lần gọi kế tiếp    | planned    |
| Chưa đăng nhập                | Không token ở ba route                                                                                                                                                            | http                        | 401 như hiện có                                                                                                                             | planned    |
| US-01-01 AC-17 (hồi quy)      | `M2` gọi route chỉ Manager; `IT1` gọi route chỉ Finance/Manager; `U3` gọi route chỉ IT Admin                                                                                      | http + integration          | 403 như hiện có                                                                                                                             | planned    |

Cách đổi vai ở dòng `US-16-04` AC-6: hôm nay bằng hai route gán/thu hồi (đường hiện có của
`mobile-session-roles.integration-spec.ts:314-334`); `qd95-one-role-per-account` Task 4 viết lại đúng test đó bằng
`PUT /app-users/{id}/role` và giữ khẳng định "có hiệu lực ở lần gọi kế tiếp".

## Definition of Done

- [ ] Test trên đỏ-trước/xanh-sau; các test cũ khẳng định 403 đã đổi theo plan (không xóa khẳng định của route theo vai).
- [ ] Quick set (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`),
      `pnpm test:http`, `pnpm openapi:export` (diff chỉ ở `meSoftwareRightList`, `employeeDashboardGet`, `meAccessRequestList`,
      `returnRequestSubmit`),
      integration theo file đổi.
- [ ] Báo FE/mobile: ba route mở cho mọi vai; Super Admin nhận trang/số 0 thay 403/`NOT_AVAILABLE` và bị từ chối hoàn trả; IT
      Admin mở danh sách báo lỗi của mình bằng `scope=mine`. Roadmap, G1/G8/G10 scope map, items README cập nhật.

## Changes and acceptance

- 04/11/2026: thêm Super Admin (`GET /me/access-requests`, section `requests`, từ chối hoàn trả — thiếu ở code), `saasIssues`, `US-16-04` AC-5/AC-6 (nhận từ
  `a09-mobile-auth-inbox-contract`), sửa câu "80 route `@AuthenticatedOnly` ⟹ mở cho mọi vai"; `US-01-01` AC-17 chuyển sang
  `qd95-one-role-per-account`.
- Chưa implement.
