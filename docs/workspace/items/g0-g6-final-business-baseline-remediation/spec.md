# Spec: remediation G0–G6 theo baseline nghiệp vụ cuối `QĐ-87` → `QĐ-92`

- Phụ trách: chưa phân công — giao qua Prompt 04 (`04-implement-g0-g6-final-business-baseline-remediation.md`); phân phase cho
  Dev A/dev BE khác ở [plan](plan.md#phân-công-trong-cùng-hạng-mục).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 03, 26/10/2026) trên audit chỉ đọc toàn G0–G6.
- Thiết kế: `ready` (27/10/2026): Owner đã trả lời mọi disposition chặn ở [Owner dispositions](#owner-dispositions) (chín mục
  = A), hệ quả chốt ở [mục L](#l-hệ-quả-của-disposition-owner-27102026); `ready` không có nghĩa Owner đã duyệt tài liệu. Owner review tài liệu: chưa (chờ
  Owner commit).
- Nguồn (pin cuối, P03-D16 = A, 26/10/2026): Docs `main = origin/main = e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` (sổ `QĐ-01` →
  `QĐ-92`; BRD v3.57; Định nghĩa phạm vi v1.36; User Stories v0.15 — 157 mã, 144 dùng, 13 `RETIRED`, 1 560 AC; Full Logical ERD 3.3;
  State Machine `SM-01` → `SM-05`; handoff `organization-workforce-authority-2026-10-24` gồm `BEH-14`, `T-10`, `T-11`), BE `7c28e75`
  (`dev = origin/dev`, CI run `40311320867` success; merge G5/G6 `0da8f56`, Prompt 02 `bf2c3e9`). Pin trước: Docs `769bb64` (`QĐ-90`,
  BRD v3.55, 1 550 AC) — delta `769bb64..e0cb5a0` audit ở [impact matrix mục 3.8](impact-matrix.md#38-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92).
- Nguồn gốc pin là Git và Owner pin, **không** phải câu _chưa Owner review/commit_ còn sót trong handoff Docs (metadata drift — F61).
- Thứ tự căn cứ: `QĐ` → BRD → Story/AC → Main Flow/Use Case → ERD/State Machine → handoff (chỉ là chỉ mục). WF/UF là lịch sử (`QĐ-87i`).
- Nhóm roadmap: G0–G6 — chỉ là planning container; hạng mục này là `technical-enabler` (xem `## Sizing decision`).
- [Impact matrix](impact-matrix.md) (inventory đầy đủ — danh sách chuẩn ở mục 3.0, hiện 68 finding) · [plan](plan.md) ·
  [test matrix](test-matrix.md) · [báo cáo review](../../../reviews/g0-g6-final-business-baseline-review-2026-10-26/README.md).

## Business outcome

Sau hạng mục này mã G0–G6 trên `dev` thỏa baseline Docs `e0cb5a0` (gồm vòng đời phiên bản và đề xuất ngân sách năm của `QĐ-91`,
`QĐ-92`: đóng cuối năm, phiên bản tiếp theo sau khi bị từ chối, phòng chưa có trưởng phòng, Request chờ phiên bản, thông báo): Super
Admin sở hữu cơ cấu tổ chức, hồ sơ, sự kiện nhân sự và
`BM-09` kèm căn cứ; IT Admin chỉ làm tác vụ kỹ thuật với quyền đọc tối thiểu; phòng tồn tại trước Cost Center và nghiệp vụ có chi
phí bị chặn trước kiểm tra ngân sách khi phòng chưa hoàn tất cấu hình tài chính; mỗi thuê bao có đúng một phòng sở hữu; chức vụ là
chữ tự do; bộ công cụ chuẩn, phân bổ tỷ lệ và chuyển phòng tài khoản dịch vụ được gỡ; điều chuyển xử lý Request trả phí, seat cũ và
rà soát mọi quyền theo `QĐ-89b`, `QĐ-90b`. Kiểm được bằng test đỏ-trước/xanh-sau theo [test matrix](test-matrix.md) và một lượt
gate cuối (`pnpm check`, e2e, integration đầy đủ, OpenAPI, diễn tập migration, vai runtime H7).

## Sizing decision

- Container: mọi finding trong bảng chuẩn [impact matrix mục 3.0](impact-matrix.md#30-tóm-tắt) của audit Docs `e0cb5a0` ↔ BE `7c28e75`
  (F01 → F61 lập trên pin `769bb64`, cộng finding của delta Docs cuối), theo Owner decision `EXEC-DEC-01` (26/10/2026: một work item,
  một Prompt 04, phase nội bộ). Phạm vi là bảng đó, không phải một dải ID cố định.
- Mode: `technical-enabler`.
- Outcome and owner: mã đã merge khớp baseline nghiệp vụ cuối; chạm các capability đã sở hữu finding — `installation`,
  `organization/*`, `identity-access/recovery`, `onboarding`, `data-import/*`, `catalog/subscription`, `catalog/standard-toolset`
  (gỡ), `finance/cost-allocation` (gỡ), `licensing/*`, `requests/*`, `budgets/*`, `personnel/*`, `notifications/inbox`, gate
  `src/*.spec.ts`, `test/**`, migration mới.
- Boundaries: migration tiến mới (không sửa migration đã merge); mỗi phase là một ranh giới transaction/contract riêng (schema →
  tổ chức/danh tính → danh mục/license → Request/ngân sách → nhân sự → contract); không route mới ngoài các thay thế ghi ở
  `## Behavior and design`; không đụng FE/Mobile/Docs.
- Not larger: G7+ (ghost seat tạm dừng, đối soát, báo cáo, gia hạn), `LD-13` bảy điểm, định dạng ngày/tiền OpenAPI, gom sweeper
  vào worker, refactor allowlist nội module — xem `## Explicit out of scope`; mặc định A của disposition không chặn giữ nguyên ([mục L.9](#l9-disposition-không-chặn)).
- Not smaller: các finding chia chung một chuỗi migration (đảo chiều phòng–Cost Center, phòng sở hữu thuê bao, gỡ chức vụ/bộ chuẩn)
  mà từng phase sau đọc; tách thành nhiều hạng mục sẽ để `dev` ở trạng thái nửa baseline (schema mới, actor cũ) giữa các lần
  merge và nhân đôi diễn tập migration — Owner chọn một hạng mục, phase nội bộ có checkpoint.
- Siblings: `api-list-detail-contract-remediation` (`LD-13`), `g4-notification-delivery` (cảnh báo `FR-5.14` ngoài phạm vi),
  `g4-request-and-transfer-integration`, `g2-downstream-integration`, `g3-downstream-finance-integration`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                           | Coverage | Phần còn lại thuộc                                                                                                                                                |
| ----- | -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `F01` → `F08` (nền schema và dữ liệu)        | n/a      | gỡ chặn `g2-cost-center-catalogue`, `g3-subscription-purchase`, `g4-provisioning-queue-manual`, `g5-request-submission-and-routing`                               |
| —     | `F09` → `F19` (tổ chức, danh tính, khởi tạo) | n/a      | AC mở lại của `g2-department-profile`, `g2-employee-official-field-maintenance`, `installation-local-data-h6-1-h6-2`, `g2-employee-intake-by-super-admin`         |
| —     | `F20` → `F26` (danh mục, license)            | n/a      | AC mở lại của `g4-seat-baseline-import`, `g4-provisioning-failure-handling`, `licensing-assignment-read-contracts`                                                |
| —     | `F27` → `F39` (Request, ngân sách)           | n/a      | AC mở lại của `g5-request-submission-and-routing`, `g5-budget-check-and-finance-review`, `g5-budget-version-decision`, `g5-step-reassignment-and-controlled-wait` |
| —     | `F40` → `F48` (nhân sự)                      | n/a      | AC mở lại của `g6-transfer-record`, `g6-transfer-tool-review`, `g6-hr-notices-and-verification`, `g6-service-account-handover`                                    |
| —     | `F49` → `F61` (contract, gate, tài liệu)     | n/a      | gỡ chặn `openapi-response-examples` (`F7`–`F10` của Prompt 02), `delivery-gate-hardening`; còn lại theo disposition                                               |
| —     | `F62` → `F67` (delta `QĐ-91`, `QĐ-92`)       | n/a      | AC mới/mở lại của `g5-budget-proposal-and-review`, `g5-budget-version-decision`, `g5-budget-check-and-finance-review`, `g5-request-status-notifications`          |

Story/AC vẫn thuộc hạng mục chủ ở scope map; hạng mục này không claim coverage. Mỗi hạng mục chủ có ghi chú ngày 26/10/2026 nêu AC
mở lại và finding.

## Supporting references

- Quyết định: `QĐ-87a` → `QĐ-87i` + `D-1` → `D-18`, `QĐ-88a` → `QĐ-88c`, `QĐ-89a` → `QĐ-89e`, `QĐ-90a` → `QĐ-90f` (Docs `769bb64`
  `Decisions/project-decisions.md` L2790–L2948); giữ `QĐ-44`, `QĐ-47`, `QĐ-62c`, `QĐ-62f`, `QĐ-77`, `QĐ-80`, `QĐ-82`, `QĐ-83a`,
  `QĐ-84`, `QĐ-85`, `QĐ-86`. Delta pin cuối: `QĐ-91a` → `QĐ-91f`, `QĐ-92a` → `QĐ-92d` (Docs `e0cb5a0` L2956–L3018).
- Handoff BEH-01 → BEH-14, T-1 → T-11, §7 marker, §8 18 mã `chặn-thiết-kế`.
- Story/AC delta `72e1480` → `769bb64`: [impact matrix mục 9](impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64);
  `769bb64` → `e0cb5a0` (+10 AC): [mục 9.1](impact-matrix.md#91-delta-user-stories-769bb64--e0cb5a0).
- Rule BE: [api-contract](../../../rules/api-contract.md), [database-business](../../../rules/database-business.md),
  [security-jobs](../../../rules/security-jobs.md), [module-structure](../../../rules/module-structure.md),
  [work-item-sizing](../../../rules/work-item-sizing.md).
- Logical ERD 3.3 (Docs `ERD/logical/LOGICAL-ERD.md`, `LOGICAL-ERD-MAPPING.md`; `BudgetProposal`, `BudgetVersion.sourceProposalId`,
  `BudgetVersion.rejectedPredecessorId`) — tên logical, **không** phải contract. State Machine `SM-04` v1.2 — dẫn xuất từ `QĐ-91`/`QĐ-92`,
  dòng cấm của nó là ca test.

## Explicit out of scope

- G7+ (`QĐ-90c` khuyến nghị ghost seat tạm dừng — G7; `QĐ-88a`/`QĐ-89d` cho quyết định gia hạn/giảm/hủy — G8; hợp thức hóa và
  `QĐ-90f` chấp nhận khoản chi — G9; báo cáo _Chưa phân bổ Cost Center_, chi phí theo phòng sở hữu — G8).
- `QĐ-90d` đổi gói, rà soát quyền định kỳ — chỉ đặc tả.
- `US-14-06` yêu cầu chỉnh sửa (lát xuyên nhóm sau G5) — chỉ ghi nơi nhận là Super Admin (`D-3`).
- `LD-13` điểm 1 → 7, gate collection cho phản hồi POST, `format`/`pattern` ngày/tiền (F55, F56) — P03-D14 mặc định A (mục L.9).
- Gom sweeper vào worker (F53) và refactor allowlist nội module (F54) — P03-D12, P03-D13 mặc định A (mục L.9).
- Cảnh báo license `FR-5.14` ngoài phạm vi `QĐ-87b`(3)/`D-7`/`SoD-5` (F58) — `g4-notification-delivery` (P03-D15 mặc định A — mục L.9).
- Kỳ hủy được là dự báo (F35) — hoãn tới G8 (P03-D10 mặc định A — mục L.9).
- Báo cáo ngân sách so thực chi của năm đã kết thúc theo ngân sách đối chiếu (`BEH-14`(5)) — G8; Prompt 04 chỉ đổi phần đọc ngân sách ở
  view G5 hiện có (F62). Danh mục cảnh báo/dashboard `US-12-15` — G8; Prompt 04 chỉ phát các dòng của F67.
- FE/Mobile, repo Docs, Prompt 27, deploy `main`, `H7-OPS-01`.

## Dependencies and blockers

- **Không còn disposition chặn:** Owner trả lời ngày 27/10/2026 P03-D01 → P03-D07, P03-D09, P03-D11 = **A** (thiết kế nháp, kênh
  thủ tục Super Admin, dữ liệu cũ, contract phá vỡ, nguồn giá) — hệ quả ở [mục L](#l-hệ-quả-của-disposition-owner-27102026). P03-D08 **đóng theo nguồn** và
  P03-D16 **đã trả lời** (26/10/2026). P03-D10, P03-D12 → P03-D15 dùng mặc định khuyến nghị A (mục L.9). Điều kiện vào Prompt 04 còn
  lại: Owner commit tài liệu Prompt 03.
- **Docs pin cuối (26/10/2026):** `QĐ-91`, `QĐ-92`, BRD v3.57, 1 560 AC, `BEH-14`/`T-10`/`T-11`, Logical 3.3 đã commit trong `e0cb5a0`;
  Owner chọn P03-D16 = A ⟹ delta làm trong **cùng** hạng mục (mục 3.8 của impact matrix; mục 3.7 là lịch sử).
- F62, F63, F36, F66, F67 có schema ở Phase 1; F64, F65 dựa F01 (Cost Center → phòng sau đảo chiều) và F27 (cổng tài chính chạy trước);
  F62 dùng khóa (Cost Center, năm) của F31; F65 dựa F33 (kiểm lại theo kết cục).
- Phase 1 (migration) đi trước mọi phase khác; trong Phase 1, F01 đi trước F27 (cột Cost Center nullable) và F02 đi trước F20.
- Hệ quả disposition: F19 có schema ở Phase 1 (Task 1.8) trước lệnh thủ tục ở Phase 5 (Task 5.5, sau Task 5.1); F02 triển khai mở
  rộng → gán → thu hẹp qua hai revision: mốc mở rộng (Task 1.2a) chạy đầu tiên, Prompt 04 dừng nội bộ một lần ở
  `expansion-ready-owner-action`, migration (B) — migration đầu tiên của bản cuối — ở Task 1.2c chỉ sau khi gán xong; (A) chỉ cộng thêm, tương thích image
  cũ (mục L.3, review `P03-RV-01`, `P03-RV-02`); dòng chờ của loại bị gỡ (F41, F06) hủy trên bản đang chạy trước deploy
  (mục L.4, L.5).
- Ranh giới hai revision (review `P03-RV-03`, [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)): mốc mở rộng là **bản tương thích** — cùng điểm dừng
  duy nhất `expansion-ready-owner-action`, nay gồm mọi phần cộng thêm và mọi chuyển ứng dụng khỏi đối tượng mà bản cuối thu hẹp/xóa (F01,
  F03, F04 → F06, F20, từ vựng enum, F63/F36) — Task 1.1a, 1.2a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a; mọi migration của bản cuối tương thích với
  image tương thích đang chạy hoặc được H7 phục hồi; không có điểm dừng thứ hai. F01 (review `P03-RV-04`, [mục L.11](#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04)): Cost Center luôn thuộc đúng một phòng ở schema cuối; Task 1.2b có thêm **một bước kích hoạt** của operator (Owner duyệt 27/10/2026) — không deploy boundary thứ hai.
- F15, F20, F21, F22 phụ thuộc F02; F44 phụ thuộc F01; F42 phụ thuộc F04 (gỡ bộ chuẩn) và F29; F43 phụ thuộc F20.
- Môi trường: PostgreSQL 17 cô lập theo `test/README.md`; diễn tập migration trên CSDL có dữ liệu dựng ở `7c28e75`.
- **Làm rõ lịch trình (Owner, 27/10/2026, continuation §9.1 — không đổi thiết kế, disposition hay thứ tự deploy):** bản tương thích là commit
  `fba4dfe0885f19e6a76a6e6e7e15d30223d124ab` (bất biến; chưa push, chưa CI). Mã và migration của bản cuối (Task 1.2c trở đi, gồm migration (B) của L.3) được viết
  và diễn tập **cục bộ** trên PostgreSQL cô lập và các mốc gán tổng hợp được bảo vệ, không chờ Task 1.2b action 9. Action 9 (L.3, L.10, L.11) vẫn là điều
  kiện **trước khi áp bản cuối trên CSDL thật có dữ liệu**: artifact tương thích dựng đúng từ `fba4dfe`, CI/release, các bước operator theo thứ tự, `READY` thật; diễn tập
  cục bộ không thay hành động operator. Các cổng preflight và khối `RAISE` giữ nguyên để một CSDL thật bỏ qua mở rộng/gán/liên kết vẫn bị chặn trước migration.

## Ownership: module, data, API

- `installation` (lệnh cài đặt, `ops:inspect`), `organization` (department, cost-center, employee, project; gỡ job-title),
  `identity-access/recovery` (F18, F19), `onboarding` (F14), `data-import/employee-import`, `data-import/seat-baseline-import`.
- `catalog/subscription` (phòng sở hữu), `catalog/subscription-owner-assignment` (lệnh gán phòng sở hữu cho thuê bao đã có — mục L.3),
  gỡ `catalog/standard-toolset` và `finance/cost-allocation`.
- `licensing/provisioning`, `licensing/assignment` (bất biến phòng sở hữu, read model phần mềm phòng, gỡ service-account move),
  `licensing/license-key` (F23).
- `requests/*` (cổng tài chính, nháp, re-routing, kết cục điều chuyển, `SoD-8`, khóa (Cost Center, năm), Request chờ phiên bản, quy tắc
  bộ chiếu cho vòng Finance–trưởng phòng), `budgets/budget` (vòng đời phiên bản/đề xuất, đóng cuối năm, phiên bản tiếp theo, lịch sử sửa,
  thông báo ngân sách).
- `personnel/*` (actor, căn cứ, `BM-09`, rà soát sau điều chuyển và sau khởi tạo, `STILL_NEEDED`; `personnel/super-admin-event` — lệnh
  thủ tục có kiểm soát, mục L.2), `notifications/inbox` (mã mới, thông
  báo giữ chờ cho trưởng phòng đầu tiên).
- Bảng: xem [impact matrix mục 7](impact-matrix.md#7-chuyển-tiếp-schema-migration-tiến-không-down). Không thêm bounded context.
- Contract giữ nguyên: mọi operation không nêu ở [impact matrix mục 6](impact-matrix.md#6-contract-và-bàn-giao-femobile).

## Behavior and design

### A. Phòng và Cost Center (F01, F16, F44, T-4)

- Cost Center thuộc **đúng một** phòng suốt vòng đời, không chuyển phòng (`QĐ-87d`(1)): bản cuối `cost_centers.department_id` và `linked_at` **NOT NULL**, không đổi sau khi có (trigger `cost_centers_department_link_once`), `UNIQUE(department_id) WHERE status = 'ACTIVE'`; phòng không còn khóa tới Cost Center và **được** chưa có Cost Center (_cấu hình tài chính chưa hoàn tất_). Cost Center `7c28e75` chưa có liên kết chỉ là **dữ liệu chuyển tiếp** ở bản tương thích: kiểm kê sống liệt kê, Finance liên kết theo căn cứ có thẩm quyền bằng lệnh thủ tục, bản cuối không deploy được khi còn — không Cost Center nào ở schema cuối thiếu phòng ([mục L.11](#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04), review `P03-RV-04`). _Cost Center hiện hành_ của phòng tại ngày D là Cost Center có [`linked_at`, `deactivated_at`) chứa D (ngày theo múi giờ tổ chức).
- `costCenterCreate` (Finance; contract cuối, có từ bản tương thích) nhận `departmentId` của phòng `ACTIVE` không có Cost Center `ACTIVE` và ghi liên kết trong cùng câu chèn; không có đường nào tạo Cost Center thiếu phòng; tách/gộp ⟹ Cost Center mới.
- Ngừng Cost Center (Finance) bị chặn khi còn Request có chi phí chưa kết thúc hoặc khoản cam kết đang giữ của Cost Center; hóa đơn/
  sao kê thuộc G8/G9 (ghi chú `blocked` khi các bảng đó có). Không xóa, không tháo lịch sử; sau khi ngừng phòng về _cấu hình tài
  chính chưa hoàn tất_.
- Cost Center của nhân viên/Request/khoản chi **suy ra** theo phòng và ngày; có thể không có. Không Cost Center giữ chỗ.
- Sự kiện nhân sự vào phòng chưa có Cost Center không bị chặn (F44); bỏ `DEPARTMENT_COST_CENTER_INACTIVE` khỏi nhận người.

### B. Thẩm quyền tổ chức và nhân sự (F09–F14, F17–F19, F40, F45)

- **Super Admin** ghi: phòng (tạo, sửa, ngừng), trưởng phòng, người kế nhiệm trưởng phòng (`D-5`, operation mới chỉ định/hủy),
  IT Admin phụ trách, dự án, hồ sơ Employee (tạo, import, sửa trường chính thức gồm chức vụ), sự kiện nhân sự (điều chuyển gồm dời/
  hủy, nghỉ dài/quay lại, bàn giao/nghỉ việc gồm đổi/hủy, nghỉ đột ngột), xử lý/xác minh `BM-09`. Mỗi lệnh ghi bắt buộc `hrBasis`
  (loại, số hoặc tệp, người ban hành, ngày — `src/infrastructure/http/dto/hr-basis.dto.ts`) và Audit trước/sau; thiếu ⟹ 422
  `VALIDATION_ERROR`, không ghi. Ngoại lệ duy nhất: lệnh cài đặt (Audit đánh dấu _ngoại lệ cài đặt_).
- Super Admin **không** gửi/duyệt Request (F30), không cấp/thu hồi, không tạo Cost Center/ngân sách, không gửi `BM-09`, không làm
  trưởng phòng, không thao tác hồ sơ/sự kiện/`BM-09` về chính mình (F19).
- **IT Admin** giữ tác vụ kỹ thuật tạo **từ** sự kiện (thu hồi, cấp, bàn giao kỹ thuật `BM-08`) và mất mọi quyền ghi tổ chức/hồ sơ/
  sự kiện; đọc qua projection tối thiểu (mã, họ tên, phòng, trạng thái làm việc, ngày hiệu lực cần cho cấp/thu hồi) chỉ cho phòng
  được giao và khi xử lý thay — không trả `grounds`, bản ghi xác minh, hồ sơ đầy đủ (F12, T-5).
- Quyền là **policy ở service** của từng capability (vai, tự thao tác, căn cứ), guard controller chỉ là lớp ngoài (F13).
- Bỏ cờ `selfExecuted`/`SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN` của sự kiện nhân sự (F45); giữ luật tác vụ cấp/thu hồi cho chính IT Admin.
- **Thông báo bù** (F17, P03-D15 A): hồ sơ mới → trưởng phòng và IT Admin phụ trách (chuẩn bị cấp phát, `US-02-02` AC-17); mọi ghi
  sự kiện/sửa hồ sơ của Super Admin → nhân viên bị tác động và trưởng phòng liên quan (`QĐ-87b`(3)); `BM-09` mới/quá hạn → Super
  Admin; nghỉ đột ngột → Super Admin và IT Admin phụ trách; người giữ vai rời đi chưa có người thay → Super Admin (gồm vai
  `SUPER_ADMIN`); hạn rà soát sau điều chuyển → trưởng phòng mới. Ghi trong cùng giao dịch với sự kiện qua hộp thông báo hiện có.
- **Super Admin là đối tượng** (F19, `QĐ-87c`, `QĐ-88b`): luồng thường từ chối (403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN`,
  `PERSONNEL.SELF_CHANGE_FORBIDDEN`); thủ tục có kiểm soát là lệnh `pnpm ops:record-super-admin-event` (P03-D02 = A —
  [mục L.2](#l2-thủ-tục-có-kiểm-soát-khi-super-admin-là-đối-tượng-p03-d02-f19)). Người giữ vai đã rời: ghi sự kiện rời đi bằng lệnh đó → tài khoản bị chặn theo quy tắc _đã nghỉ
  việc_ → `REASSIGN` hiện hành (`pnpm ops:recover transfer-role`) khôi phục người giữ vai đủ điều kiện; không nới `REASSIGN`.
- **Cài đặt** (F09): lệnh tạo tổ chức, **một** phòng không Cost Center/trưởng phòng/IT Admin phụ trách, Employee Super Admin thuộc
  phòng đó, AppUser Super Admin đã kích hoạt; không Cost Center, không chức vụ danh mục, không Employee IT; `ops:inspect` nhận cả tập
  cũ (bản cài trước) và tập mới.
- **Checklist bước 1** (F14): hoàn tất khi không còn lỗi dữ liệu chặn; thiếu Cost Center/trưởng phòng/IT Admin phụ trách là cảnh
  báo (thêm `MISSING_COST_CENTER`); bỏ `NO_FREE_COST_CENTER` và gợi ý bộ chuẩn; Super Admin đọc được.
- **Ngừng phòng** (F15): chặn khi còn thành viên, việc đang mở (Request chưa kết thúc của phòng, sự kiện chờ, tác vụ mở), tài khoản
  dịch vụ, hoặc thuê bao/khoản mua phòng sở hữu còn nghĩa vụ trả phí tương lai (chưa hủy, chưa hết hạn; khoản mua vĩnh viễn không còn
  Assignment không chặn); 409 `DEPARTMENT.IN_USE` liệt kê theo nhóm, mỗi nhóm có biên + tổng.
- **`P28-05`** (F18): mọi lời mời/đặt lại/thông báo gửi `loginEmail` của tài khoản, kể cả `REASSIGN`; recipient rỗng là lỗi lập trình.

### C. Chức vụ (F03, F41, D-1, T-5)

- Chức vụ là cột chữ tự do, tùy chọn, trên hồ sơ Employee (`employees.job_title`, ≤ 255 ký tự, cắt khoảng trắng); không danh mục,
  không API CRUD, không cấp quyền/định tuyến. Đổi chức vụ = sửa hồ sơ có căn cứ + Audit trước/sau; không là sự kiện, không là loại
  `BM-09`, không mở rà soát, không tính vào _một sự kiện chờ_.
- Import: cột `job_title` tùy chọn, so khác biệt như mọi trường; dòng thiếu không lỗi.
- Điều chuyển chỉ đổi phòng; `BM-09` bốn loại (`DEPARTMENT_TRANSFER_OUT/IN` là hai biểu mẫu của điều chuyển, `DEPARTURE`,
  `ABRUPT_DEPARTURE`, `LONG_LEAVE`). Dữ liệu cũ: P03-D04 = A, P03-D05 = A — [mục L.4](#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41).

### D. Thuê bao và Assignment theo phòng sở hữu (F02, F20–F23, F26)

- `subscriptionCreate` bắt buộc `ownerDepartmentId` (phòng đang hoạt động); không đổi được qua PATCH (đổi phòng sở hữu không có
  nguồn nghiệp vụ — ghi Owner nếu cần sau); thuê bao tạo/điều chỉnh từ Request đã duyệt lấy phòng của Request. Thuê bao đã có: gán
  theo căn cứ mua/hợp đồng bằng lệnh vận hành, không suy diễn (P03-D03 = A — [mục L.3](#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02)).
- Bất biến: phòng sở hữu của Assignment trả phí = phòng sở hữu của thuê bao (service — 422
  `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` từ bản tương thích, mục K, L.10 — + trigger); đích cấp của Request chỉ là thuê
  bao của phòng Request; seat trống `G1` tính theo phòng sở hữu; không pool seat.
- Bước 4 khởi tạo (F21, `QĐ-89e`): seat của người phòng khác được ghi trên thuê bao phòng sở hữu; khi IT Admin chốt bước 4, mỗi
  người giữ seat thuộc phòng khác vào **rà soát sau khởi tạo** do trưởng phòng **của họ** quyết, cùng luật hạn/nhắc/không tự thu
  hồi của rà soát sau điều chuyển (nguồn thu hồi mới `POST_SETUP_REVIEW`).
- Read model phần mềm phòng (F22): gom theo phòng sở hữu của Assignment + tài khoản dịch vụ thuộc phòng; nhãn `K1` _đang chấm dứt_;
  `K4` khi có dữ liệu người giữ khóa (nếu chưa có thì `blocked` theo `US-04-12`, không bịa); không nhập tay, không phải khuyến nghị.
- Khai thuê bao/nhập khóa cho ứng dụng `RETIRED` bị từ chối (F23).
- PATCH thuê bao tạo/tăng/kéo dài nghĩa vụ khi phòng sở hữu chưa có Cost Center hiện hành ⟹ 409 `FINANCE.SETUP_INCOMPLETE`; sửa
  không tăng/kéo dài vẫn được (P03-D09 = A — [mục L.7](#l7-patch-thuê-bao-khi-phòng-chưa-có-cost-center-p03-d09-f26)).

### E. Kênh thủ công (F07, F08, T-8)

- Hoàn tất mọi tác vụ `MANUAL` (K1 → K5) bắt buộc bằng chứng = chữ không rỗng (≤ giới hạn hiện có); tệp đính kèm là mở rộng sau.
  `ALREADY_GONE` lưu ghi chú làm bằng chứng.
- Chuyển làm tay: body rỗng (`{}`), không bằng chứng; giữ `lastError`, `failureKind`, `failureReason`, `attempts` cuối; CHECK
  `hand_off_whole` chỉ còn `handed_off_by` ↔ `handed_off_at`; cột `hand_off_evidence` giữ nullable cho lịch sử.
- Tác vụ cấp: duy nhất **trong tác vụ đang mở** của (Assignment, `GRANT`).
- `SoD-5` (F24): đếm IT Admin dùng được trong cùng giao dịch (facade nhận `tx`); tự thực thi ⟹ cờ audit **và** thông báo Super Admin trong **cùng** giao dịch.
  _Tuyến tính hóa (28/10/2026, F24 — không thêm khóa):_ câu đếm là `READ COMMITTED` không khóa hàng và hành động được xếp tại thời điểm câu đếm; một IT Admin khác kích hoạt/khóa sau câu đếm không làm trái nguyên tắc
  (nguyên tắc nói "còn IT Admin dùng được khác lúc làm"), khóa cùng lúc cho kết quả bảo thủ (từ chối). Kiểm đua trên PostgreSQL thật `deferred-by-owner-test-policy`.
- Thứ tự khóa (F25): một thứ tự duy nhất Request → thuê bao → Assignment → tác vụ cho mọi đường; test đỏ có barrier trước.

### F. Request và ngân sách (F27–F39, T-1, T-3)

- **Cổng tài chính** (F27): phòng của Request/đề xuất không có Cost Center hiện hành ⟹ 409 `FINANCE.SETUP_INCOMPLETE` (tên chốt ở
  mục K, một mã một status, phân biệt `NO_ACTIVE_BUDGET` và _phòng chưa có trưởng phòng_) **trước** kiểm tra ngân sách, trên
  mọi đường trình Request trả phí (cá nhân, nhóm, ủy quyền, tài khoản dịch vụ trả phí, gia hạn có thời hạn, đề xuất phần mềm mới),
  lô trình duyệt chi, `BM-10`, tạo/sửa đổi phiên bản ngân sách. Request nội bộ không phí, báo lỗi SaaS, tác vụ kỹ thuật không bị chặn.
  _Làm rõ (28/10/2026, F91, `QĐ-87g(2)`):_ cổng chạy **sau** khi biết nhánh của gói — nhánh `INTERNAL_FREE` đi tiếp với Cost Center `null`: `access_requests.cost_center_id` NULL cho nhánh đó (CHECK `access_requests_cost_center_unless_draft` = `DRAFT` hoặc có Cost Center hoặc `INTERNAL_FREE` không phải `SERVICE_ACCOUNT`, migration `20261029101100`), wire `costCenter` của Request và preview nullable, không Cost Center giữ chỗ, không tính vào phòng khác. **Owner chọn A cho `OD-SA-FREE-CC` ngày 28/10/2026: Request tài khoản dịch vụ giữ cổng ở mọi nhánh, kể cả phần mềm nội bộ không phí; phòng chưa có Cost Center bị chặn ngay khi gửi với 409 `FINANCE.SETUP_INCOMPLETE`, không ghi gì; chỉ cho gửi sau khi có Cost Center.** Seat dịch vụ phải quy về Unit của phòng (`QĐ-86a`, CHECK `license_assignments_service_has_reason_and_cost_center`). Ví dụ: tài khoản dịch vụ cho ứng dụng nội bộ miễn phí ở phòng chưa có Cost Center bị từ chối; không cho gửi/duyệt trước rồi gác ở bước IT cấp seat. Lựa chọn khớp code hiện tại, không cần đổi runtime. Hệ quả tương thích với image `fba4dfe` (đọc dòng NULL lỗi) ghi ở impact matrix mục 3.11, `P04-CPE-04`, vẫn mở riêng.
- **Nháp** (T-1, P03-D01 = A — operation và schema ở [mục L.1](#l1-nháp-request-trả-phí-p03-d01-f27)): Request trả phí của phòng chưa có Cost Center lưu ở trạng thái `DRAFT` (cột Cost Center nullable chỉ khi
  `DRAFT`, CHECK); không bước, không kiểm tra, không khoản cam kết, không vào `KPI-2`; trình = chuyển `DRAFT → SUBMITTED` chạy lại mọi
  cổng; người tạo xóa được nháp của mình.
- Super Admin không gửi Request (F30): 403 trên mọi đường gửi, kiểm ở service.
- **Điều chuyển** (F28, F29, `QĐ-90b`): sự kiện điều chuyển hiệu lực chỉ xác định lại bước nhu cầu của Request **nội bộ không phí**
  (`FR-3.16`); Request trả phí giữ phòng lúc gửi; trigger đổi trưởng phòng khóa theo `access_requests.department_id`. Phần chưa cấp
  xong (Request cá nhân hoặc dòng của người đó trong Request nhóm) liệt kê ở rà soát sau điều chuyển và do IT Admin đóng
  _bị hủy — người thụ hưởng điều chuyển_ (nguyên nhân mới `BENEFICIARY_TRANSFERRED`) kèm lý do; tác vụ cấp còn mở chỉ kết thúc
  _đã hủy — người thụ hưởng điều chuyển_ sau khi IT Admin xác nhận đã đối chiếu nhà cung cấp và thu lời mời (trường xác nhận bắt
  buộc); đã có quyền thật ⟹ không đóng là _đã hủy_, quyền vào danh sách quyền đang giữ. Giải phóng **chỉ** phần cam kết chưa phát
  sinh chi (`QĐ-83a`).
- **Tuần tự hóa** (F31): kiểm tra ngân sách lúc trình/duyệt và ghi khoản cam kết giữ khóa giao dịch theo (Cost Center, năm tài chính)
  — `pg_advisory_xact_lock` trên khóa băm ổn định, lấy theo thứ tự năm tăng dần sau khóa Request.
- `SoD-8` (F32): người hoàn tất Finance rà soát không được là người quyết bước duyệt chi của cùng Request (và ngược lại) ⟹ 409
  `SPEND.REVIEWER_IS_APPROVER` — cùng mã ở `financeReviewComplete` (cả đường chờ phiên bản — J.3) và ở `spendApprovalDecide`.
- Kết cục _cần sửa ngân sách_ (F33, P03-D08 đóng theo nguồn — BRD v3.57 `FR-3.20`, `QĐ-92d`(2), `US-06-13` AC-13): chọn được cho
  `INSUFFICIENT_BUDGET` và `NO_ACTIVE_BUDGET` khi phòng của Request có trưởng phòng có hiệu lực; không chọn được (`NO_HEAD_TO_PROPOSE`)
  khi không có — kể cả khi đã có phiên bản hiện hành; `HIGH_VALUE`, `PLAN_LINE_OVERDUE` không đổi. Phiên bản của (Cost Center, năm) được
  duyệt ⟹ kiểm lại **mọi** Request đang chờ phiên bản của năm đó (theo kết cục rà soát đã ghi, không theo mã kiểm tra).
- Request trả phí có số tiền 0 ⟹ coi là _chưa đủ dữ liệu giá_ (422 hiện có), không tới bước duyệt (F34).
- Phiên bản nháp của đề xuất đã rút/trả về (F36, **làm lại theo `QĐ-91a`** — bản đầu ghi _đóng `CANCELLED`_ và _thao tác hủy bản nháp_,
  nay bỏ vì thêm trạng thái ngoài nguồn): bản nháp **giữ** `DRAFT`, được đánh dấu _tách khỏi đề xuất_ trong cùng giao dịch rút/trả lại
  (chỉ đọc — không sửa, không gửi), không tính vào ràng buộc _một bản đang làm_ của (Cost Center, năm), và thành _hết hiệu lực — đóng khi
  chưa thành hiện hành_ khi năm kết thúc (mục I). Không xóa phiên bản (`FR-5.15`(2)).
- 500 (F37): `reason: null` trên REVISION ⟹ 422 `BUDGET.REVISION_REASON_REQUIRED`; `planId` lạ ⟹ 422 `BUDGET.PLAN_NOT_FOUND`; recorder thông báo nghỉ việc
  và điều chuyển đi qua `guarded()` ⟹ 409 `CONCURRENT_CHANGE`. Va chạm số phiên bản ⟹ 409 `BUDGET.VERSION_NUMBER_TAKEN` (F39).
- Giá Request (F38, P03-D11 = A — [mục L.8](#l8-nguồn-giá-của-request-p03-d11-f38)): thuê bao đang hoạt động của **phòng Request** nếu có, không thì giá
  gói/báo giá (`BM-02`); không bao giờ lấy thuê bao của phòng khác.

### G. Rà soát sau điều chuyển và tài khoản dịch vụ (F06, F42, F43, F46–F48, T-6, T-7)

- Rà soát mở khi điều chuyển hiệu lực cho **mọi** quyền cá nhân đang giữ (trả phí và nội bộ `K5`), không phụ thuộc bộ chuẩn; kèm danh
  sách _thông tin_ phần Request trả phí chưa cấp xong (F29). 5 ngày làm việc, không tự thu hồi, quá hạn chỉ nhắc, phòng mới thiếu
  trưởng phòng ⟹ chờ (`QĐ-62c`).
- `NOT_NEEDED` ⟹ mở thu hồi (như hiện tại). `STILL_NEEDED` ⟹ ghi _cần Request mới của phòng nhận_ (liên kết tới Request khi được tạo);
  seat cũ thu hồi (thành `G1` phòng cũ nếu nhà cung cấp chưa giảm) khi tác vụ cấp của Request mới hoàn tất, hoặc khi Request đó kết
  thúc không cấp, hoặc khi trưởng phòng đổi quyết định sang `NOT_NEEDED`; không có quyết định thì không thu hồi (T-6). Người xác nhận
  bàn giao gói mất dữ liệu: trưởng phòng mới (`QĐ-62f`).
- Gỡ chuyển phòng tài khoản dịch vụ (F06); giữ đổi người chịu trách nhiệm trong phòng sở hữu; phòng nhận gửi Request mới, quyền cũ
  thu hồi thành `G1` phòng cũ (`QĐ-89c`).
- Một sự kiện chờ xuyên loại: giữ kiểm ở service dưới khóa Employee, thêm test đua có barrier (F46).
- Căn cứ và bản ghi xác minh (T-7): giữ lưu trữ hiện có — bản ghi xác minh **chỉ** khi ghi từ `BM-09`.
- F47: không sửa migration cũ; `ops:inspect` báo giai đoạn/kỳ trưởng phòng bị seed lệch múi giờ và một migration tiến ghi bổ sung dấu
  _đã báo_ theo múi giờ tổ chức nếu thiếu. F48: sequence theo năm (`BM09-<năm>-<số>`) cấp lại từ 1 mỗi năm qua bảng đếm có khóa.

### H. Contract, gate, tài liệu (F49–F52, F60)

- OpenAPI: mô tả mã khớp mã với tới được (`F1`, `F2`, `F4`, `F7` 52 dòng, `F10`); `F8` — khai mã chuyển qua của capability khác trên
  `personnelNoticeRecord` và hook thu hồi (Owner hoãn sang Prompt 03, nay làm); mapper chết gỡ (F50); registry collection bỏ mục
  operation bị gỡ (ghi sự kiện registry theo luật gate).
- Gate tên migration mới > migration cuối đã merge (F51); suite vai runtime chạy một đường ghi G5 và một G6 (F52).
- Test đồng thời (F59, Task 6.4 của [plan](plan.md#task-64-test-đồng-thời-có-barrier-f59)): mọi test đua đã có ở G4–G6 chứng minh thứ tự
  bằng helper chuẩn `waitForLockWaiters` (`test/support/lock-wait.ts`); không sleep cố định, không `Promise.all` trần làm bằng chứng.
  Giữ nguyên hành vi sản phẩm và kết quả khẳng định; chỉ sửa mã khi test barrier tất định chứng minh lỗi thật (ghi finding mới trong
  impact matrix, đỏ → xanh).
- Re-pin scope map G2–G6 sang Docs `769bb64` (bỏ khóa của `US-02-07`, `US-04-08`, `US-04-10`; giao AC mới cho hạng mục chủ), cập nhật
  spec/plan chủ, `AGENTS.md`/`ARCHITECTURE.md` (mô tả năng lực, worker) (F60).

### I. Vòng đời phiên bản và đề xuất ngân sách năm (F62 → F67, `QĐ-91`, `QĐ-92`, `BEH-14`, `T-10`, `T-11`)

- **Tập trạng thái** (`QĐ-91a`): phiên bản `DRAFT` (nháp) · `SENT` (chờ quyết định) · `CHANGES_REQUESTED` (yêu cầu sửa) · `APPROVED`
  (hiện hành — tên giữ nguyên, nghĩa _hiện hành_) · `SUPERSEDED` · `REJECTED` · **_hết hiệu lực_** (mới) kèm cờ _chưa từng hiện hành_ và
  mốc đóng; đề xuất `SUBMITTED` · `RETURNED` · `WITHDRAWN` · `REVIEWED` (đã dùng lập phiên bản) · **_đóng — hết năm tài chính_** (mới).
  Tên enum/cột chốt ở mục K (`T-10`); không thêm trạng thái nào khác (không `CANCELLED` cho phiên bản — F36).
- **Đóng cuối năm** (F62, `QĐ-91c`, `QĐ-91e`): việc hệ thống cho mỗi (Cost Center, năm) đã kết thúc theo `FISCAL_YEAR_START_MONTH` và múi
  giờ tổ chức; `APPROVED → hết hiệu lực` (ngân sách đối chiếu, không thêm thông báo); `DRAFT`/`SENT`/`CHANGES_REQUESTED → hết hiệu lực` +
  cờ _chưa từng hiện hành_ + Audit _đóng khi chưa thành hiện hành_ (tác nhân `SYSTEM`); việc quyết đang mở trên bản `SENT` đóng **không**
  kèm bản ghi quyết định; đề xuất `SUBMITTED`/`RETURNED` → _đóng_. Chạy lại không đổi kết quả; mỗi (Cost Center, năm) một giao dịch, lấy
  khóa (Cost Center, năm) của F31 rồi khóa dòng phiên bản/đề xuất theo cùng thứ tự với `decide`/`send`. Sweeper đặt như các sweeper hiện có
  (P03-D12 A). Kể cả trước khi việc đóng chạy: sau ngày kết thúc năm, quyết định, sửa, sửa dòng, nhập dòng, gửi, rút, trả lại, nộp lại trên
  phiên bản/đề xuất của năm đó ⟹ `BUDGET.YEAR_ENDED` (422 hiện có). View ngân sách G5 (`budgetTable`, `budgetMine`, snapshot) đọc **ngân
  sách đối chiếu** cho năm đã kết thúc, không bao giờ đọc bản chưa từng hiện hành.
- **Phiên bản tiếp theo sau khi bị từ chối** (F63, `QĐ-92c`): từ chối giữ đề xuất ở `REVIEWED` (bỏ nhánh trả đề xuất về `RETURNED` của
  `version-decision.service.ts:87-95`); lập lại phiên bản từ cùng đề xuất qua `BudgetVersion.rejectedPredecessorId`; đề xuất mới khi nhu cầu
  đổi qua liên kết kế tiếp `BudgetProposal.successorOfProposalId`; dòng `RETURNED` cũ được đối soát tất định — thiết kế chốt ở
  [mục J.1, J.2](#j1-liên-kết-kế-tiếp-của-đề-xuất-f63). _Trả lại_ đề xuất `REVIEWED` vẫn bị từ chối. Phiên bản bị từ chối không mở lại,
  không sửa.
- **Phòng chưa có trưởng phòng** (F64, `QĐ-92d`(1)): `budgetVersionRevise` (phiên bản sửa đổi, gồm điều chỉnh chuyển tiếp) bị từ chối với
  409 `BUDGET.DEPARTMENT_HAS_NO_HEAD` khi phòng của Cost Center không có trưởng phòng có hiệu lực tại ngày nghiệp vụ; phiên bản đã tạo/đã gửi tiếp tục; lập lại từ đề
  xuất đã nộp (F63) vẫn được. Kết cục _cần sửa ngân sách_ — mục F (F33).
- **Request chờ phiên bản** (F65, `QĐ-92a`, `QĐ-92d`(2)): phiên bản bị từ chối, bị yêu cầu sửa hoặc hết hiệu lực khi chưa từng hiện hành ⟹
  Request **giữ** `AWAITING_BUDGET` (bỏ `reopenReview` ở `spend-budget.listener.ts:41-45`), Finance được báo; trong lúc chờ Finance chuyển
  Request sang _trả về trưởng phòng_ hoặc _hoàn tất nhận định ngoại lệ_ — bản ghi rà soát gắn lần kiểm tra mới nhất, cùng luật `SoD-8` (F32);
  người yêu cầu/trưởng phòng rút được; không bước duyệt chi nào tạo từ phiên bản hết hiệu lực; trình/kiểm lại sau khi năm đóng ⟹
  `CLOSED_OR_EXPIRED_BUDGET_PERIOD` (hiện có). Thao tác: **mở rộng `financeReviewComplete`** — contract chốt ở
  [mục J.3](#j3-finance-xử-lý-request-đang-chờ-phiên-bản-f65); không operation thứ hai.
- **Lịch sử sửa** (F66, `QĐ-91d`): mỗi lần sửa phiên bản/dòng/nhập dòng ghi Audit Trail có trước/sau thật **và** một dòng của bảng lịch sử
  chỉ ghi thêm của capability, đọc qua `budgetVersionHistoryList` — chốt ở [mục J.4](#j4-lịch-sử-sửa-phiên-bản-f66); không dùng
  `audit_events` làm read model.
- **Thông báo** (F67, `QĐ-92b`, `FR-5.14`): chỉ hộp thông báo; người nhận theo vai lúc gửi; khóa tham số không mang số tiền; ghi cùng giao
  dịch — dòng 18, 40, 41, 47, 48, 52, 53, 54, 55 như [impact matrix F67](impact-matrix.md#f67--không-có-thông-báo-vòng-ngân-sách-và-vòng-financetrưởng-phòng).
  Dòng 53 khi phòng chưa có trưởng phòng: lưu thông báo **giữ chờ** ở bảng `held_department_notifications` của capability `notifications` (`prisma/models/notifications.prisma`): `id`, `organization_id`, `department_id` (FK `RESTRICT`), `code`, `subject_type`, `subject_id`, `params` JSONB, `event_key` (`UNIQUE`), `held_at`, `delivered_at` NULL, `delivered_to_employee_id` NULL; CHECK `delivered_at` ⟺ `delivered_to_employee_id`; khi Super Admin gán trưởng phòng đầu tiên (F10), cùng
  giao dịch chèn thông báo trong ứng dụng cho người đó và đặt `delivered_*`, không gửi ai khác (`T-11`).
  _Làm rõ trong Giai đoạn II (28/10/2026, F74, F75):_ "khi gán" nghĩa là **khi kỳ trưởng phòng bắt đầu** — cùng giao dịch lệnh gán khi `effectiveFrom` là hôm nay,
  còn gán ngày tương lai thì ở lượt báo thay đổi `HEAD_PERIOD_START` tới ngày; người ghi thông báo giữ chờ đọc trưởng phòng **sau khi** khóa phòng `FOR SHARE`
  (không còn hàng giữ chờ của phòng đã có trưởng phòng). Dòng của Request (41, 47, 48)
  phát qua bộ chiếu trạng thái từ sự kiện audit; dòng của đề xuất/phiên bản (18, 40, 52 → 55) gọi `notifyInApp` trực tiếp trong giao dịch
  của `budgets/budget`. Không đổi OpenAPI (`code` là chuỗi). Dòng 54: khi Finance trả lại đề xuất mà người nộp không còn là trưởng phòng, và khi
  trưởng phòng mới được gán lúc việc nộp lại/rút đang chờ. Không thêm dòng ngoài bảng (`US-12-15` AC-1).

### J. Thiết kế đã chốt cho F63, F65, F66 (26/10/2026, Prompt 03 tiếp)

Chốt trong Prompt 03 để Prompt 04 không còn lựa chọn hiện thực ngỏ ở ba finding này. Tên trường/mã dưới đây là contract của Prompt 04;
đổi tên chỉ khi ghi lại ở mục này trước khi sửa mã.

#### J.1 Liên kết kế tiếp của đề xuất (F63)

- **Nguồn:** `QĐ-92c`(2) (_trưởng phòng có hiệu lực nộp bản chụp đề xuất mới trỏ về đề xuất trước; đề xuất trước giữ đã dùng lập phiên bản_);
  Logical 3.3 `BudgetProposal.revision` (_bản mới số lớn hơn trỏ về bản trước_, `UNIQUE(budgetId, revision)`) — chuỗi tuyến tính; không nguồn
  nào cho nhánh ⟹ tối đa **một** kế tiếp trực tiếp mỗi đề xuất.
- **Schema** (`prisma/models/budgets.prisma`, `BudgetProposal`; migration cấu trúc của Task 1.7): trường `successorOfProposalId` (`String?`,
  `@unique`, cột `successor_of_proposal_id`, `@db.Uuid`) với quan hệ `successorOf`/`successor` (`"BudgetProposalSuccession"`,
  `onDelete: Restrict`), và trường `succeededAt` (`DateTime?`, cột `succeeded_at`, `@db.Timestamptz(3)`). Khác `previousProposalId` (bản nộp lại sau khi **Finance** trả lại —
  giữ nguyên nghĩa).
- **Ràng buộc CSDL** (raw SQL, ADR-0005):
  - FK `budget_proposals_successor_of_proposal_id_fkey` → `budget_proposals(id)` `ON DELETE RESTRICT`; `UNIQUE (successor_of_proposal_id)`.
  - CHECK `budget_proposals_succession_check`: `successor_of_proposal_id IS NULL OR previous_proposal_id IS NULL` (bản nộp lại **hoặc** bản kế
    tiếp, không cả hai) · `successor_of_proposal_id IS DISTINCT FROM id` · `succeeded_at IS NULL OR state = 'REVIEWED'`.
  - Trigger `budget_proposals_succession_guard` `BEFORE INSERT` (khi có `successor_of_proposal_id`): khóa đề xuất trước `FOR UPDATE`; bắt
    buộc cùng `organization_id`, `cost_center_id`, `year`; đề xuất trước `state = 'REVIEWED'`, `succeeded_at IS NULL`; phiên bản **mới nhất**
    (`number` lớn nhất) có `proposal_id` = đề xuất trước ở `REJECTED`; dòng mới `state = 'SUBMITTED'`; rồi đặt `succeeded_at` của đề xuất
    trước = `submitted_at` của dòng mới. `BEFORE UPDATE`: `successor_of_proposal_id` không đổi sau khi chèn; `succeeded_at` không đổi khi đã
    có giá trị. Vi phạm ⟹ `RAISE EXCEPTION … USING ERRCODE = '23514'`.
  - Constraint trigger `budget_proposals_succession_consistent` (`DEFERRABLE INITIALLY DEFERRED`, `AFTER INSERT OR UPDATE`): `succeeded_at`
    có giá trị ⟹ có đúng một dòng trỏ `successor_of_proposal_id` về nó (chặn ghi tay `succeeded_at` không có kế tiếp).
  - `budget_proposals_open_key` thay bằng `UNIQUE (cost_center_id, year) WHERE state IN ('SUBMITTED', 'REVIEWED') AND succeeded_at IS NULL`.
- **Service/repo** (`proposal.service.ts`, `proposal.repo.ts`, `version.repo.ts`, `budget.policy.ts`): `budgetProposalSubmit` **không đổi
  body** — dưới khóa (Cost Center, năm) của F31, tìm đề xuất `REVIEWED`, `succeeded_at IS NULL` của (Cost Center, năm) và phiên bản mới nhất
  lập từ nó: không có ⟹ như hiện tại; có và phiên bản mới nhất `REJECTED` ⟹ đề xuất mới là kế tiếp của nó (hệ thống đặt
  `successor_of_proposal_id`, không do client chọn), Audit `BUDGET_PROPOSAL.SUBMITTED` ghi `successorOfProposalId`; có và phiên bản mới
  nhất không `REJECTED` ⟹ 409 `BUDGET.PROPOSAL_ALREADY_OPEN` (hiện có). Chỉ trưởng phòng có hiệu lực (`requireHead` giữ). `resubmit` không
  đổi (chỉ từ `RETURNED`, đặt `previous_proposal_id`).
- **Phiên bản** (`version.service.ts` `createFromProposal`, `budgetVersionCreate` không đổi body): nhận đề xuất `SUBMITTED` (như cũ) **hoặc**
  `REVIEWED` với `succeeded_at IS NULL` mà phiên bản mới nhất lập từ nó `REJECTED` ⟹ phiên bản mới có `rejected_predecessor_id` = bản bị từ
  chối đó (hệ thống đặt); còn lại 409 `BUDGET.PROPOSAL_NOT_SUBMITTED` (mã hiện có, mô tả OpenAPI mở rộng). Phiên bản lập từ đề xuất kế tiếp
  **không** đặt `rejected_predecessor_id` — truy vết qua `successor_of_proposal_id`. `BudgetVersion.rejectedPredecessorId` (cột
  `rejected_predecessor_id`, FK tự tham chiếu `RESTRICT`, `UNIQUE`) giữ là liên kết **phiên bản → phiên bản** riêng; trigger
  `budget_versions_rejected_predecessor_guard`: đích cùng `cost_center_id`, `year`, cùng `proposal_id` với dòng mới, `state = 'REJECTED'`; dòng
  mới `kind = 'INITIAL'`.
- **Đua:** trưởng phòng nộp kế tiếp và Finance lập lại từ cùng đề xuất cùng khóa dòng đề xuất trước — Finance thắng (bản nháp mới, phiên bản
  mới nhất không còn `REJECTED`) ⟹ trưởng phòng 409 `BUDGET.PROPOSAL_ALREADY_OPEN`; trưởng phòng thắng (`succeeded_at` có) ⟹ Finance 409
  `BUDGET.PROPOSAL_NOT_SUBMITTED`. Hai kế tiếp cùng lúc ⟹ một thắng, bên kia 409 (khóa + `UNIQUE`).
- **Wire** (chỉ đọc, cộng thêm): `ProposalWire.successorOfProposalId`, `successorProposalId`, `succeededAt`; `VersionWire.rejectedPredecessorId`.

#### J.2 Dòng `RETURNED` cũ của đường từ chối trả đề xuất (F63, dữ liệu)

- **Dấu vết tất định** của đường cũ (`version-decision.service.ts:87-95` ở `7c28e75` ghi cùng một `now`): đề xuất `P` ở `RETURNED` có **đúng
  một** dòng `budget_version_decisions` `decision = 'REJECTED'` trên phiên bản `kind = 'INITIAL'`, `state = 'REJECTED'`, `proposal_id = P`, và
  `decided_by_employee_id = P.returned_by_employee_id`, `reason = P.returned_reason`, `decided_at = P.returned_at`. Đề xuất `RETURNED` không có
  quyết định từ chối nào trên phiên bản của nó = Finance trả lại thật ⟹ giữ nguyên.
- **Phân loại** mỗi đề xuất mang dấu vết `P`:
  - **R1** — không có đề xuất nào khác của cùng (Cost Center, năm) nộp sau `P.returned_at` ⟹ `P` về `REVIEWED`, `returned_*` về `NULL`.
  - **R2** — có **đúng một** bản nộp lại `C` (`C.previous_proposal_id = P`) và mọi đề xuất khác của cùng (Cost Center, năm) nộp sau
    `P.returned_at` đều thuộc chuỗi nộp lại bắt đầu từ `C` ⟹ `P` về `REVIEWED`, `P.succeeded_at = C.submitted_at`; `C.previous_proposal_id`
    → `NULL`, `C.successor_of_proposal_id = P`; trạng thái của `C` và chuỗi sau `C` giữ nguyên.
  - **A (mơ hồ)** — mọi ca còn lại: hai bản nộp lại trở lên; đề xuất mới nộp sau không trỏ về `P`; có quyết định từ chối nhưng một trong ba
    trường khác; nhiều quyết định từ chối; phiên bản từ chối không phải `INITIAL`. **Không đoán.**
- **`ops:preflight`** (`src/modules/installation/migration-preflight/*`): `BLOCKED` khi có ca A, blocker mới
  `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS { proposalId, versionIds, decisionIds, relatedProposalIds }` — **chỉ ID**, không lý do hay văn bản;
  `READY` liệt kê ca R1/R2 sẽ đổi (`proposalId`, `rule`) như danh sách correction hiện có.
- **Migration** (cấu trúc của Task 1.7, theo mẫu `20261023100000_service_account_owner_on_recorded_day`): (1) khối `DO $$` tính ca A — có ⟹
  `RAISE EXCEPTION` liệt kê ID, _Nothing was changed. Run `pnpm ops:preflight`_, không ghi gì; (2) thêm cột, bỏ `budget_proposals_open_key` cũ;
  (3) bảng tạm `ON COMMIT DROP` các ca R1/R2; (4) một Audit Trail mỗi đề xuất đổi, tác nhân `SYSTEM`, action
  `BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED`, `before` (`state`, `returnedReason`, `returnedByEmployeeId`, `returnedAt`; R2 thêm
  `previousProposalId` của `C`), `after` (`state`, `succeededAt`, `successorOfProposalId`, `decisionId`, `rule`, `migration`),
  `correlation_id` = tên migration; (5) cập nhật dòng; (6) tạo CHECK, trigger, constraint trigger, `budget_proposals_open_key` mới. Lý do từ
  chối còn nguyên ở `budget_version_decisions` (append-only) và audit `BUDGET_VERSION.REJECTED` gốc. Cả migration là một giao dịch ⟹ lỗi ở
  bất kỳ bước nào (kể cả tạo chỉ mục mới) không để lại ghi dở.
- **Rollback:** không có down (`DB-05`); khôi phục `pg_dump` mốc trước `migrate deploy`; ca A xử lý từng ID (Owner/operator, ngoài migration)
  trên bản khôi phục rồi chạy lại `ops:preflight` → `migrate deploy`.

#### J.3 Finance xử lý Request đang chờ phiên bản (F65)

- **Operation:** **giữ** `financeReviewComplete` (`POST /access-requests/{id}/finance-review`), body và từ vựng kết cục giữ nguyên
  (`ASSESSED` + `opinion` + `direction` = _hoàn tất nhận định ngoại lệ_; `RETURN_TO_HEAD` + `reason` = _trả về trưởng phòng_; `NEEDS_BUDGET` +
  `reason`). Không operation thứ hai.
- **Hai trạng thái nhận:** (a) có bước `FINANCE_REVIEW` đang mở — hành vi hiện tại; (b) không có bước mở **và** Request `AWAITING_BUDGET` —
  đường chờ phiên bản. Khác ⟹ 409 `SPEND.REVIEW_NOT_OPEN`.
- **Đường (b)**, một giao dịch: khóa Request `FOR UPDATE` (`lockById`) rồi đọc lại trạng thái và bước mở dưới khóa.
  - `NEEDS_BUDGET` ⟹ 409 `SPEND.ALREADY_AWAITING_BUDGET` (lý do mới của `SpendReviewRefusedError`), không ghi.
  - `RETURN_TO_HEAD`, `ASSESSED` ⟹ mở **và** hoàn tất một bước `FINANCE_REVIEW` mới (`assignee` = Finance gọi, `assigned_at` = `decided_at` =
    lúc gọi) vì `request_finance_reviews` khóa chính `step_id` (một rà soát mỗi bước); bản ghi rà soát gắn lần kiểm tra mới nhất; bước mở-đóng
    trong cùng lệnh không phát thông báo giao bước.
  - `RETURN_TO_HEAD` ⟹ `AWAITING_SPEND_SUBMISSION` + rời lô `RETURNED_BY_FINANCE`, như đường (a).
  - `ASSESSED` ⟹ chạy lại kiểm tra ngân sách với trigger mới `FINANCE_OUTCOME_WHILE_WAITING` (`BudgetCheckTrigger`, `ADD VALUE`): có mã dữ
    liệu (`CLOSED_OR_EXPIRED_BUDGET_PERIOD`, `STALE_COST_EVIDENCE`) ⟹ về hàng đợi trình, **không** tạo bước duyệt chi (`QĐ-92a`); không ⟹ mở
    bước duyệt chi mang nhận định Finance (không mở Finance rà soát lần nữa dù vẫn là ngoại lệ).
- **Quyền ở service** (F13): không giữ vai `FINANCE` ⟹ 403 `SPEND.NOT_FINANCE`; Finance là người yêu cầu hoặc người thụ hưởng ⟹ 403
  `SPEND.OWN_REQUEST` (không có rà soát độc lập — `QĐ-82l`(8)); `SoD-8`: Finance gọi đồng thời là người sẽ quyết bước duyệt chi của Request
  (Người duyệt chi, hoặc người thay thế khi xung đột theo `FR-3.15`) ⟹ 409 `SPEND.REVIEWER_IS_APPROVER` — cùng mã cho đường (a) (F32).
  `spend.http-errors.ts`: `SpendReviewRefusedError` lý do `OWN_REQUEST` ánh xạ 403 (cùng status với `SPEND.OWN_REQUEST` hiện có của duyệt
  chi — một mã một status), các lý do khác giữ 409.
- **Status/mã với tới được:** 200 `FINANCE_REVIEW.COMPLETED` (`ReviewDetailResponseDto` không đổi); 403 `SPEND.NOT_FINANCE`, `SPEND.OWN_REQUEST`;
  404 `ACCESS_REQUEST.NOT_FOUND`; 409 `SPEND.REVIEW_NOT_OPEN`, `SPEND.ALREADY_AWAITING_BUDGET`, `SPEND.REVIEWER_IS_APPROVER`,
  `SPEND.PLAN_LINE_NOT_UPDATED` (`ASSESSED` khi dòng kế hoạch còn quá hạn — cả hai đường), `SPEND.NO_BUDGET_TO_MAKE`, `SPEND.NO_HEAD_TO_PROPOSE`
  (chỉ đường (a)); 422 `VALIDATION_ERROR`; cộng 400/413/415 của parser, 401, 429, 503 chung. Mỗi mã một status.
- **Đồng thời/idempotency:** API không có khóa idempotency; lệnh lặp sau khi thành công ⟹ 409 `SPEND.REVIEW_NOT_OPEN`, không bản ghi thứ hai.
  Hai lệnh Finance cùng lúc; lệnh Finance đua với duyệt phiên bản (listener khóa cùng Request), rút Request, đóng cuối năm ⟹ tuần tự theo khóa
  dòng Request — bên sau đọc trạng thái mới (409 `SPEND.REVIEW_NOT_OPEN`, hoặc Request đã được kiểm lại theo phiên bản mới).
- **OpenAPI:** mô tả 200/403/409 cập nhật; ví dụ mới `SPEND.OWN_REQUEST`, `SPEND.ALREADY_AWAITING_BUDGET`, `SPEND.REVIEWER_IS_APPROVER` (qua
  `SPEND_ERROR_EXAMPLES` và manifest `test/support/openapi-example-route-codes-*`); số operation không đổi; `BudgetCheckTrigger` thêm một giá
  trị nếu enum này xuất hiện trong schema phản hồi.

#### J.4 Lịch sử sửa phiên bản (F66)

- **Lưu:** bảng chỉ ghi thêm của capability `budgets/budget` — `budget_version_history` (Prisma `BudgetVersionHistoryEntry`,
  `prisma/models/budgets.prisma`). `audit_events` **không** là read model của Finance/Người duyệt chi.
  - Cột: `id` UUID `@default(uuid())` (như các bảng ngân sách) · `organization_id` (FK) · `version_id` (FK `budget_versions` `RESTRICT`) · `seq`
    INT ≥ 1 · `kind` enum `BudgetVersionHistoryKind` (`FIGURES_UPDATED`, `LINE_UPDATED`, `LINES_ADDED`, `LINES_IMPORTED`, `WINDOW_MOVED`) ·
    `version_state` (`BudgetVersionState` lúc sửa) · `position` INT NULL (`LINE_UPDATED`, `WINDOW_MOVED`) · `from_position`, `to_position`,
    `line_count` INT NULL (`LINES_ADDED`, `LINES_IMPORTED`) · `before` JSONB NULL · `after` JSONB NOT NULL (đối tượng trường → giá trị; thêm/nhập
    dòng: mảng dòng ≤ `LINES_MAX` = 200) · `changed_by_employee_id` UUID (giá trị, không FK — như `budget_version_line_changes`) · `changed_at`
    TIMESTAMPTZ(3).
  - `UNIQUE (version_id, seq)` (cũng là chỉ mục đọc theo trang); CHECK hình dạng theo `kind`; CHECK `octet_length(after::text) <= 262144`;
    trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` (như `budget_version_decisions`). `seq` = lớn nhất + 1 của phiên bản, cấp dưới khóa dòng phiên
    bản mà mọi đường sửa đã giữ (`editable`, `lockById`) ⟹ không đua. Không backfill: lịch sử bắt đầu từ migration (sửa cũ chỉ có trong Audit
    Trail với `before: null`).
- **Ghi:** `VersionService.update`, `VersionLineService.updateLine`, `addLines`, `changeWindow`, `LineImportService` — mỗi lệnh, trong **cùng**
  giao dịch, ghi (1) một Audit Trail với `before`/`after` thật của các trường đổi (`budgetAuditEvent` nhận `before`) và (2) **một** dòng lịch
  sử. Dời khoảng mua vẫn ghi `budget_version_line_changes` (đọc ở `budgetVersionLineChangeList`) và thêm một dòng `WINDOW_MOVED`.
- **Đọc:** `GET /budget-versions/{id}/history`, operationId **`budgetVersionHistoryList`**, `@AuthenticatedOnly()`; quyền ở service: Finance
  (vai `FINANCE`) **hoặc** người quyết phiên bản đó lúc gọi theo đúng cách `decide` xác định (Người duyệt chi; người thay thế khi xung đột nếu
  Người duyệt chi là người nộp đề xuất của phiên bản) — còn lại 403 `AUTHORIZATION.FORBIDDEN`; phiên bản không có 404
  `BUDGET.VERSION_NOT_FOUND`; query `page` ≥ 1 (mặc định 1), `pageSize` 1 → 100 (mặc định 20) như các trang ngân sách khác, sai ⟹ 422
  `VALIDATION_ERROR`. Thứ tự `seq` **giảm dần** (mới nhất trước, như `budgetVersionLineChangeList`; không trùng vì `UNIQUE`).
- **Wire:** `BudgetVersionHistoryPageResponseDto` (`Page<…>`, message `BUDGET_VERSION.HISTORY_LISTED`); mỗi mục gồm `seq`, `kind`,
  `versionState`, `position`, `lines` (`{ fromPosition, toPosition, count }` hoặc `null`), `changes` (mảng `{ field, before, after }`),
  `currency`, `by` (`{ id, name }`), `at` — `changes` `maxItems: 16`; `before`/`after` là chuỗi hoặc `null` (tiền: số thập phân theo `currency` của phiên bản; ngày `YYYY-MM-DD`); dòng
  thêm/nhập chỉ hiện khoảng vị trí và số dòng (nội dung đủ ở cột `after`, đọc dòng qua `budgetVersionLineList`). **Không** có vai, phiên,
  `correlationId`, IP hay dữ liệu của bản ghi khác. Ví dụ OpenAPI: 200, 403 `AUTHORIZATION.FORBIDDEN`, 404 `BUDGET.VERSION_NOT_FOUND`, 422
  `VALIDATION_ERROR`. Đăng ký collection mới ở gate `src/api-collection-contract.spec.ts` (trang có biên, mảng lồng có `maxItems`).

### K. Tên chốt — mã lỗi, cột, khóa, mã thông báo (26/10/2026, Prompt 03 tiếp)

Mọi tên dưới đây là contract của Prompt 04 (cùng quy tắc đổi tên như mục J). Theo quy ước hiện có: một mã một status
(`docs/rules/api-contract.md`), lỗi dữ liệu thân request là 422, xung đột trạng thái/kẻ thua đua là 409.

| Finding  | Tên chốt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01      | Cost Center luôn có phòng (review `P03-RV-04`, mục L.11): `costCenterCreate` với phòng không có/không `ACTIVE` ⟹ 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`; `departmentCreate` của bản tương thích trước kích hoạt ⟹ 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION` (chỉ bản tương thích); trigger `cost_centers_department_link_once`, `departments_cost_center_link_forward`, `cost_centers_department_link_backward`; bảng `cost_center_department_links`, `cost_center_direction_activations`; lệnh `pnpm ops:cost-center-direction` (`activate`, `link`); Audit `COST_CENTER_DIRECTION.ACTIVATED`, `COST_CENTER.DEPARTMENT_LINKED_BY_PROCEDURE`; preflight `COST_CENTER_TO_LINK`, `COST_CENTER_UNLINKED`, `COST_CENTER_LINK_MISMATCH`, `COST_CENTER_DIRECTION_NOT_ACTIVATED`, `COST_CENTER_DIRECTION_EXPANSION_REQUIRED`; checklist `AWAITING_ACTIVATION` |
| F12      | Projection kỹ thuật cho IT Admin `EmployeeTechnicalView { id, code, fullName, departmentId, employmentStatus, effectiveOn }`; IT Admin đọc phòng không được giao/xử lý thay ⟹ 404 (`DEPARTMENT.NOT_FOUND`, `EMPLOYEE.NOT_FOUND`, mã không có của từng tài nguyên nhân sự) — không 403, để không lộ sự tồn tại                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F16      | Tạo Cost Center cho phòng đã có Cost Center `ACTIVE` ⟹ 409 `COST_CENTER.DEPARTMENT_ALREADY_LINKED`; ngừng khi còn Request có chi phí chưa kết thúc hoặc khoản cam kết đang giữ ⟹ 409 `COST_CENTER.IN_USE` (mã hiện có, `details` theo nhóm có biên)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F17, F24 | Mã hộp thông báo (bảng đóng `notifications.types.ts`, khóa tham số trong `inbox.policy.ts`, không khóa nào khớp `FIGURE_WORDS`): `EMPLOYEE_PROFILE_CREATED`, `EMPLOYEE_PROFILE_UPDATED`, `PERSONNEL_EVENT_RECORDED`, `PERSONNEL_NOTICE_RECEIVED`, `PERSONNEL_NOTICE_OVERDUE`, `ABRUPT_DEPARTURE_RECORDED`, `ROLE_HOLDER_LEAVING`, `TRANSFER_REVIEW_DUE`, `IT_ADMIN_SELF_EXECUTED`; tham số chỉ là ID/mã (`employeeId`, `departmentId`, `eventKind`, `effectiveOn`, `noticeId`, `taskId`)                                                                                                                                                                                                                                                                                                                                                                    |
| F20      | Ghi Assignment trả phí có `owning_department_id` khác `owner_department_id` (đã có) của thuê bao ⟹ 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` (thân lệnh trỏ tới thuê bao của phòng khác — cùng mẫu `SUBSCRIPTION.APPLICATION_RETIRED`), kiểm ở policy service của `licensing/assignment` tại chỗ ghi Assignment duy nhất, **trước** khi ghi, từ **bản tương thích** (Task 3.2a); operation HTTP với tới: `provisioningTaskGrant`; dòng nhập seat (`seatBaselineImport*`) thành `ERROR` cùng mã, không ghi. Trigger `license_assignments_owner_department_guard` của (B) `RAISE … USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_owner_department_guard'`; mapper của bản tương thích và bản cuối dịch đúng constraint đó sang cùng 422 (phòng thủ sâu, không 500); cùng mã ở ví dụ OpenAPI (`provisioningTaskGrant`) và test    |
| F23      | Khai thuê bao/nhập khóa cho ứng dụng `RETIRED` ⟹ 422 `SUBSCRIPTION.APPLICATION_RETIRED`, 422 `LICENSE_KEY.APPLICATION_RETIRED` (cùng mẫu `PLAN.APPLICATION_RETIRED`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F27      | 409 `FINANCE.SETUP_INCOMPLETE` (tên chốt — bỏ _tên cuối do Prompt 04 chốt_)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| F30      | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` trên mọi operation gửi của danh sách F27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F31      | Khóa `pg_advisory_xact_lock(hashtextextended('budget-year:' \|\| cost_center_id::text \|\| ':' \|\| year::text, 0))`, lấy **sau** khóa dòng Request, theo năm tăng dần; cùng khóa dùng ở kiểm tra lúc trình/duyệt, ghi khoản cam kết, đóng cuối năm (F62), nộp đề xuất kế tiếp (F63)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F36      | Cột `budget_versions.detached_at` TIMESTAMPTZ(3) NULL (CHECK: có giá trị ⟹ `state IN ('DRAFT', 'EXPIRED')`); `budget_versions_in_flight_key` thêm `AND detached_at IS NULL`; wire `detachedAt`; sửa/gửi bản tách ⟹ 409 `BUDGET.VERSION_NOT_EDITABLE` (mã hiện có)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F37      | `reason: null` trên phiên bản `REVISION` ⟹ 422 `BUDGET.REVISION_REASON_REQUIRED` (mã hiện có); `planId` không có ở đề xuất/dòng ⟹ 422 `BUDGET.PLAN_NOT_FOUND`; recorder nghỉ việc/điều chuyển ⟹ 409 `CONCURRENT_CHANGE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F39      | Va chạm `budget_versions_cost_center_id_year_number_key` ⟹ 409 `BUDGET.VERSION_NUMBER_TAKEN` (kẻ thua đua — làm mới rồi gửi lại)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F47      | Cả hai: `ops:inspect` báo giai đoạn/kỳ trưởng phòng bị seed lệch múi giờ **và** một migration tiến ghi bổ sung dấu _đã báo_ theo múi giờ tổ chức nếu thiếu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| F48      | Bảng đếm theo năm của từng capability: `personnel_notice_counters (year PK, last_value)` và `saas_issue_counters (year PK, last_value)`, cấp số bằng `INSERT … ON CONFLICT (year) DO UPDATE SET last_value = last_value + 1 RETURNING last_value` trong giao dịch ghi; mã `BM09-<năm>-<6 chữ số>`, `BM11-<năm>-<6 chữ số>`; sequence cũ giữ cho dữ liệu cũ, không dùng cho số mới                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F62      | `BudgetVersionState.EXPIRED`; `budget_versions.never_current` BOOLEAN NOT NULL DEFAULT false, `budget_versions.expired_at` TIMESTAMPTZ(3) NULL (CHECK `(state = 'EXPIRED') = (expired_at IS NOT NULL)`, `NOT never_current OR state = 'EXPIRED'`); `BudgetProposalState.CLOSED_FISCAL_YEAR_ENDED`, `budget_proposals.closed_at`; Audit `BUDGET_VERSION.EXPIRED`, `BUDGET_VERSION.CLOSED_UNAPPROVED`, `BUDGET_PROPOSAL.CLOSED_YEAR_END` (tác nhân `SYSTEM`); `BudgetYearEndSweeper` + `BudgetYearEndService` trong `budgets/budget`; wire thêm `neverCurrent`, `expiredAt`, `closedAt`                                                                                                                                                                                                                                                                       |
| F64      | 409 `BUDGET.DEPARTMENT_HAS_NO_HEAD` trên `budgetVersionRevise`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F67      | Mã hộp thông báo: dòng 18 `BUDGET_VERSION_AWAITING_DECISION`; dòng 40 `BUDGET_PROPOSAL_SUBMITTED`, `BUDGET_PROPOSAL_RETURNED`, `BUDGET_VERSION_DECIDED`; dòng 41 `REQUEST_FINANCE_REVIEW_OPENED`; dòng 47 `REQUEST_RETURNED_BY_FINANCE`; dòng 48 `REQUEST_AWAITING_BUDGET`, `REQUEST_BUDGET_VERSION_ENDED`; dòng 52 `BUDGET_VERSION_CLOSED_UNAPPROVED`; dòng 53 `BUDGET_PROPOSAL_CLOSED_YEAR_END`; dòng 54 `BUDGET_PROPOSAL_TASK_ASSIGNED`; dòng 55 `BUDGET_PROPOSAL_TASK_WAITING`; tham số chỉ ID/mã (`proposalId`, `versionId`, `requestId`, `costCenterId`, `year`, `decision`, `reason` — không khóa chứa `budget`, `amount`, `remaining`)                                                                                                                                                                                                              |

### L. Hệ quả của disposition Owner 27/10/2026

Owner trả lời ngày 27/10/2026: P03-D01, P03-D02, P03-D03, P03-D04, P03-D05, P03-D06, P03-D07, P03-D09, P03-D11 = **A**. Mục này chốt hệ
quả hiện thực để Prompt 04 không hỏi lại; tên lệnh/trường/mã/bảng dưới đây là contract của Prompt 04, cùng quy tắc đổi tên như mục J.
Ba chỗ được làm rõ khi ghi hệ quả (không phải câu hỏi mới): dòng chờ của loại bị gỡ hủy **trước** deploy bằng thao tác hiện có vì CHECK
hiện có buộc người dùng thực hiện (L.4, L.5); P03-D03 cần bước gán dữ liệu nằm **giữa hai revision** vì cột phòng sở hữu chưa có trước
migration — mở rộng → gán → thu hẹp (L.3; sửa theo review `P03-RV-01` 27/10/2026, thay trình tự hai lượt deploy có migration lỗi chủ
đích); lệnh gán thuộc `catalog` (chủ bảng), không `installation`. Ranh giới giữa bản tương thích và bản cuối cho mọi migration thu hẹp/phá hủy
(F01, F03, F04 → F06, F20) chốt ở [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) (review `P03-RV-03`, 27/10/2026 — sửa review, không phải quyết định Owner mới). Cost Center luôn thuộc một phòng và bước kích hoạt của F01 chốt ở [mục L.11](#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04) (review `P03-RV-04`, 27/10/2026).

#### L.1 Nháp Request trả phí (P03-D01, F27)

- **Schema** (Task 1.6, hai migration như Task 1.7 — giá trị enum trước, cấu trúc sau): `AccessRequestState.DRAFT`;
  `access_requests.cost_center_id` bỏ NOT NULL + CHECK `access_requests_cost_center_unless_draft` (`state = 'DRAFT' OR cost_center_id IS
NOT NULL`); `access_requests.submitted_at` bỏ NOT NULL (giữ default) + CHECK `access_requests_submitted_unless_draft` (`(state =
'DRAFT') = (submitted_at IS NULL)`); trigger `access_requests_draft_has_no_work` `BEFORE INSERT` trên `access_request_steps`,
  `request_budget_checks`, `budget_commitments`, `spend_batch_items`: Request cha `DRAFT` ⟹ `RAISE … USING ERRCODE = '23514'`.
- **Nội dung nháp:** ghi đúng như đường trình của loại đó **tới trước** cổng tài chính (người yêu cầu, phòng hiện tại, gói, nhánh, lý do,
  số tháng, người thụ hưởng, dòng nhóm, tài khoản dịch vụ), với `cost_center_id` NULL, `submitted_at` NULL, `policy` `{}`, cột giá ở mặc
  định; không bước, không kiểm tra, không khoản cam kết; không vào hàng đợi, `KPI-2` hay đếm việc đang mở (ngừng phòng F15, điều chuyển,
  nghỉ việc). Nghỉ việc của người tạo có hiệu lực ⟹ nháp của họ bị xóa trong giao dịch đó qua hook nghỉ việc hiện có của `requests`,
  Audit `SYSTEM` `ACCESS_REQUEST.DRAFT_DELETED`.
- **Operation** (quyền ở service; Super Admin ⟹ 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`; 401/429/503 chung):
  - `accessRequestDraftSave` — `POST /access-requests/drafts`. Body là union theo `kind`: `INDIVIDUAL` (body của `accessRequestSubmit`),
    `GROUP` (body của `groupRequestSubmit`), `SERVICE_ACCOUNT` (body của `accessRequestServiceAccountSubmit`) — cùng schema validate của
    operation gốc; không chạy cổng nào. 201 `AccessRequestDraftResponseDto` (`id`, `kind`, `departmentId`, `planId`, `beneficiaryCount`,
    `createdAt`), message `ACCESS_REQUEST.DRAFT_SAVED`; 422 `VALIDATION_ERROR`.
  - `accessRequestDraftList` — `GET /access-requests/drafts`: chỉ nháp do người gọi tạo; `page` ≥ 1, `pageSize` 1 → 100 (mặc định 20), sai
    ⟹ 422 `VALIDATION_ERROR`; thứ tự `created_at` giảm dần rồi `id`; `Page<AccessRequestDraftResponseDto>`, message
    `ACCESS_REQUEST.DRAFTS_LISTED`; đăng ký collection ở gate `src/api-collection-contract.spec.ts`.
  - `accessRequestDraftSubmit` — `POST /access-requests/drafts/{id}/submission`, body `{}`: chạy **lại toàn bộ** đường trình của loại đó
    trên nội dung đã lưu với phòng hiện tại của người yêu cầu (cổng tài chính F27, F30, danh mục/gói còn hiệu lực, giá L.8, kiểm tra ngân
    sách, định tuyến, khóa F31) và chuyển chính dòng đó `DRAFT → SUBMITTED` (`submitted_at` = lúc trình). Thành công ⟹ status, DTO, message
    của operation trình gốc; lỗi ⟹ cùng mã của operation gốc, nháp giữ nguyên.
  - `accessRequestDraftDelete` — `DELETE /access-requests/drafts/{id}`: xóa hẳn dòng `DRAFT` và dòng con của nó trong một giao dịch, Audit
    `ACCESS_REQUEST.DRAFT_DELETED` (`before` = ảnh chụp allowlist); 200 `AccessRequestDraftResponseDto`, message
    `ACCESS_REQUEST.DRAFT_DELETED`.
  - Với `{id}`: không phải nháp do người gọi tạo ⟹ 404 `ACCESS_REQUEST.NOT_FOUND` (không lộ tồn tại); Request của người gọi nhưng không
    còn `DRAFT` ⟹ 409 `ACCESS_REQUEST.NOT_DRAFT`. `accessRequestGet` trả nháp chỉ cho người tạo; `accessRequestTimingsGet` của nháp ⟹ 404.
    _Độ lệch ghi trong Giai đoạn II (28/10/2026) — đóng ở Giai đoạn II lần hai (F92):_ nháp **không có wire "Request"** (không giá, bước, Cost Center) nên `accessRequestGet` từng trả 404 với mọi người, kể cả người tạo.
    Biểu diễn nhỏ nhất, không thêm operation: `data` của `accessRequestGet` là **hợp** `{ request }` | `{ draft }` (`AccessRequestOrDraftResponseDto`); `draft` dùng lại đúng `draftSchema` của `accessRequestDraftList` (`id`, `kind`, `departmentId`, `planId`, `beneficiaryCount`, `createdAt`), không điền giá/Cost Center/bước giả. Đọc Request như cũ; chỉ khi không thấy mới tra nháp **của người gọi** — nháp người khác, Request đã trình và id lạ cùng 404 `ACCESS_REQUEST.NOT_FOUND`. `accessRequestTimingsGet` của nháp 404; chi tiết Request đã trình không đổi.
    _Làm rõ (F71):_ ghi "cột giá ở mặc định" buộc nới `access_requests_pricing_check` và `access_requests_group_check` thành "là nháp, hoặc điều đã có"
    (migration `…100500` mục 4): nháp mang nhánh theo gói nhưng chưa có giá; nhóm nháp có thể nêu gói nội bộ (lúc trình mới bị từ chối).
    Sửa nháp = xóa rồi lưu lại (không có operation sửa).

#### L.2 Thủ tục có kiểm soát khi Super Admin là đối tượng (P03-D02, F19)

- **Phạm vi:** lệnh **chỉ ghi sự kiện nhân sự có kiểm soát** khi đối tượng là người đang giữ vai `SUPER_ADMIN` (kể cả người đã rời mà vai
  chưa chuyển): điều chuyển (ghi, dời, hủy), nghỉ dài (bắt đầu, quay lại), bàn giao/nghỉ việc (ghi, đổi ngày làm việc cuối, hủy), nghỉ đột
  ngột, và đính chính trường hồ sơ chính thức (`QĐ-87c`(4) đặt việc này trong cùng thủ tục). Lệnh **không** đổi người giữ vai, không
  cấp/thu vai, không chạm mật khẩu, phiên hay liên kết, không khóa/mở tài khoản, **không** thay `REASSIGN` (`ops:recover transfer-role`)
  và không phải đường khôi phục. Luật nghiệp vụ của từng sự kiện (một sự kiện chờ, cửa sổ ngày, lý do, căn cứ, thông báo F17) giữ nguyên
  — chỉ người thực hiện khác.
- **Lệnh:** `pnpm ops:record-super-admin-event <mode> [options]` — script `"ops:record-super-admin-event": "node
dist/super-admin-event-cli"`; entry `src/super-admin-event-cli.ts`, module lệnh `src/super-admin-event-cli.module.ts`; capability
  `src/modules/personnel/super-admin-event/` (`super-admin-event.arguments.ts`, `.service.ts`, `.policy.ts`, `.repo.ts`, `.errors.ts`,
  `.types.ts`); đăng ký ở `COMMAND_ENTRIES`/`COMMAND_ONLY_FILES` của `src/operational-commands.spec.ts` và bảng _Hợp đồng lệnh hiện có_
  của `docs/rules/operational-commands.md`; không tới được từ `AppModule`/`WorkerModule`; chạy như `ops:recover` (vai runtime).
- **Mode** — mỗi mode gọi đúng service ghi của capability sở hữu; tham số riêng = đúng các trường body HTTP tương ứng (tên kebab-case, cùng
  schema validate): `transfer-record`, `transfer-reschedule`, `transfer-cancel`, `leave-start`, `leave-return`, `departure-record`,
  `departure-change`, `departure-cancel`, `abrupt-departure-record`, `profile-correct` (qua facade `organization`). Mode ghi
  (`transfer-record`, `leave-start`, `departure-record`, `abrupt-departure-record`) nhận thêm `--from-notice <id BM-09>` khi sự kiện đến từ
  `BM-09` về Super Admin: thông báo thành `RECORDED` và bản ghi xác minh viết như đường `BM-09` (T-7); `BM-09` không về đối tượng ⟹
  `NOTICE_NOT_ABOUT_SUBJECT`.
- **Tham số chung bắt buộc:** `--ticket <mã phiếu phê duyệt>` (khóa idempotency, cùng mẫu `TICKET_REFERENCE` của `ops:recover`);
  `--approved-by <tham chiếu người phê duyệt bằng văn bản>`; `--operator <tham chiếu người chạy>`; `--environment LOCAL_TEST|SHARED`;
  `--subject-code <mã nhân viên của người giữ vai>`; căn cứ có thẩm quyền ngoài hệ thống `--basis-type`, `--basis-reference`,
  `--basis-issuer`, `--basis-issued-on` (`HrBasis`). Không nhận mật khẩu, token, bí mật hay liên kết: tùy chọn tên `password`, `pass`,
  `pwd`, `secret`, `token`, `code`, `link` bị từ chối theo tên trước khi nạp môi trường (như `ops:recover`).
- **Tách người** (`super-admin-event.policy.ts`, trước khi mở giao dịch ghi): `--operator` và `--approved-by` không được trùng (không phân
  biệt hoa thường, bỏ khoảng trắng) mã nhân viên, email đăng nhập hay email công việc của đối tượng — ở **mọi** môi trường
  (`OPERATOR_IS_SUBJECT`, `APPROVER_IS_SUBJECT`); ở `SHARED` người chạy khác người phê duyệt (`APPROVER_IS_OPERATOR`). `LOCAL_TEST` cho một
  người vừa phê duyệt vừa chạy; Audit ghi môi trường.
- **Phân quyền ở service, đóng khi lỗi:** lệnh không có principal HTTP. `SuperAdminEventService` kiểm phiếu, tách người và đối tượng
  **đang giữ `SUPER_ADMIN`** (`SUBJECT_NOT_SUPER_ADMIN` — người khác dùng luồng thường), rồi gọi service sự kiện/hồ sơ với actor `{ kind:
'OPERATOR', ticketId, ticketRef }`. Service sự kiện/hồ sơ nhận `PersonnelActor = USER | OPERATOR`; policy của capability chỉ nhận
  `OPERATOR` khi đối tượng giữ `SUPER_ADMIN` (phòng thủ hai lớp); controller HTTP chỉ dựng `USER`. Mọi từ chối, lỗi môi trường, CSDL không
  với tới hay lỗi lạ ⟹ rollback, không ghi gì (kể cả phiếu), exit 1.
- **Ghi, một giao dịch:** dòng phiếu `super_admin_event_tickets` → sự kiện/đính chính với cột người thực hiện là phiếu → Audit Trail →
  thông báo của sự kiện.
- **Audit Trail:** `actorKind` `OPERATOR`, `actorAppUserId` NULL, `operatorReference` = mã phiếu, `correlationId` = id dòng phiếu; `action`,
  `resourceType`, `before`, `after` = đúng sự kiện của luồng thường (allowlist của capability); `after` thêm `ticket`, `approver`,
  `operator`, `environment`, `mode`, `basis` (`type`, `reference`, `issuer`, `issuedOn`). Không có mật khẩu, token, hash hay liên kết
  (lệnh không nhận và không tạo các giá trị đó).
- **Đầu ra:** chỉ `ticket`, `mode`, `outcome`, `record` (UUID bản ghi tạo/đổi) và một câu bước kế; không in tên, email, mã nhân viên, tham
  chiếu người phê duyệt/người chạy, căn cứ hay lý do. Từ chối in `Refused (<PROBLEM>). Nothing was changed.` với mã ổn định
  (`TICKET_REFERENCE_INVALID`, `TICKET_PARAMETERS_DIFFER`, `APPROVER_IS_OPERATOR`, `OPERATOR_IS_SUBJECT`, `APPROVER_IS_SUBJECT`,
  `SUBJECT_NOT_FOUND`, `SUBJECT_NOT_SUPER_ADMIN`, `BASIS_INVALID`, `NOTICE_NOT_ABOUT_SUBJECT`, hoặc mã nghiệp vụ của service sự kiện như
  ở HTTP).
- **Mã thoát:** 0 đã ghi · 2 không cần làm (cùng phiếu, cùng tham số đã ghi — không ghi lần hai) · 1 bị từ chối hoặc lỗi (không ghi gì).
  Cùng phiếu, khác tham số (`parameters_digest` khác) ⟹ 1 `TICKET_PARAMETERS_DIFFER`.
- **Người giữ vai đã rời** (`QĐ-88b`) — trình tự chuẩn, không rút gọn: (1) `pnpm ops:record-super-admin-event departure-record` (hoặc
  `abrupt-departure-record`) theo phiếu; (2) khi sự kiện có hiệu lực, tài khoản bị chặn theo quy tắc hiện hành của trạng thái _đã nghỉ
  việc_ (`QĐ-41a`, `FR-8.9`) — lệnh không khóa tài khoản; (3) `pnpm ops:recover transfer-role` theo phiếu `REASSIGN` riêng khôi phục
  người giữ vai đủ điều kiện (trước bước (2) nó từ chối `HOLDER_STILL_USABLE`); (4) người nhận vai ghi các sự kiện còn lại trong ứng
  dụng. Không nới điều kiện người nhận, phiếu, mức tách (`QĐ-41b`) hay audit của `REASSIGN`.
- **Trong ứng dụng:** Super Admin sửa hồ sơ của chính mình ⟹ 403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN`; ghi/đổi/hủy sự kiện hay xử lý `BM-09`
  về chính mình ⟹ 403 `PERSONNEL.SELF_CHANGE_FORBIDDEN` (cùng mẫu `APP_USER.SELF_CHANGE_FORBIDDEN`); mô tả lỗi chỉ tới lệnh thủ tục.
- **Schema** (Task 1.8, `prisma/models/personnel.prisma`): bảng `super_admin_event_tickets` (Prisma `SuperAdminEventTicket`): `id` UUID,
  `organization_id` (FK), `ticket_ref` TEXT, `mode` enum `SuperAdminEventMode` (mười mode trên), `subject_employee_id` (FK `RESTRICT`),
  `parameters_digest` TEXT (SHA-256 hex của tham số mode đã chuẩn hóa), `approver_ref` TEXT, `operator_ref` TEXT, `environment` TEXT
  (CHECK `IN ('LOCAL_TEST', 'SHARED')`), `recorded_at` TIMESTAMPTZ(3); `UNIQUE (organization_id, ticket_ref)`; trigger chặn `UPDATE`,
  `DELETE`, `TRUNCATE`. Người thực hiện: mỗi cột `department_transfers.recorded_by_app_user_id`, `cancelled_by_app_user_id`,
  `department_transfer_changes.changed_by_app_user_id`, `employee_leaves.started_by_app_user_id`,
  `employee_leave_changes.recorded_by_app_user_id`, `offboarding_cases.recorded_by_app_user_id`, `cancelled_by_app_user_id`,
  `offboarding_case_changes.changed_by_app_user_id`, `personnel_notices.handled_by_app_user_id`,
  `personnel_notice_verifications.verified_by_app_user_id` có cột anh em `…_by_ticket_id` (FK `super_admin_event_tickets` `RESTRICT`);
  cột đang NOT NULL thành nullable với CHECK `num_nonnulls(<cột người dùng>, <cột phiếu>) = 1`; cột đang nullable có CHECK
  `num_nonnulls(…) <= 1`; mọi CHECK đang gắn mốc (`cancelled_at`, `handled_at`) hay trạng thái với cột người dùng đổi sang _đúng một
  trong hai cột_. Không backfill (dòng cũ đều có người dùng).
- **Wire** (đổi kiểu, P03-D07 = A): mỗi trường `…ByAppUserId` tương ứng trên đọc điều chuyển, nghỉ dài, nghỉ việc, `BM-09` thành nullable
  và có trường anh em `…ByProcedure` (boolean); mã phiếu không lên wire (chỉ ở Audit Trail).

#### L.3 Phòng sở hữu cho thuê bao đã có (P03-D03, F02)

- **Trình tự mở rộng → gán → thu hẹp** (review `P03-RV-01`, 27/10/2026 — chỉ đổi trình tự hiện thực; quyết định Owner P03-D03 = A giữ
  nguyên: không suy diễn phòng, ghi dòng gán đã duyệt, cuối cùng `subscriptions.owner_department_id` NOT NULL). Prisma định nghĩa
  `migrate resolve` để khôi phục migration lỗi, baseline hoặc đối soát hotfix tay
  ([resolve](https://docs.prisma.io/docs/cli/migrate/resolve),
  [failed migration](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing#failed-migration)) và
  `migrate deploy` áp **mọi** migration đang chờ ([deploy](https://docs.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy))
  ⟹ bước gán dữ liệu phải nằm giữa **hai revision**, không giữa hai migration của một lượt deploy. `READY` của `ops:preflight` nghĩa là
  lượt deploy đang chờ chạy được; `BLOCKED` dừng **trước** migration. **Cấm cho D03:** `prisma migrate resolve` (`--rolled-back`,
  `--applied`), migration lỗi có chủ đích hay `P3009`, lượt deploy được dự kiến dừng giữa chừng, sửa migration đã áp, ghi
  `_prisma_migrations`, SQL tay trên CSDL thật, `prisma db push`.
- **Bất biến mở rộng/thu hẹp** (review `P03-RV-02`, 27/10/2026): ở mỗi bước, runtime **trước** và runtime **sau** đều hợp lệ trên schema
  đang có. H7 chạy sao lưu → preflight → `migrate deploy` → `reconcile` **trước** khi recreate `api`/`worker`, và phục hồi image trước khi
  deploy lỗi (`docs/guides/containers.md` _Deploys after H7_) ⟹ runtime `7c28e75` phải chạy được trên schema sau (A), và runtime mở rộng
  phải chạy được trên schema sau (B). Ràng buộc CSDL về phòng sở hữu chỉ do (B) đặt.
- **Mốc mở rộng** (Task 1.2a — phần D03 của **bản tương thích**, revision triển khai độc lập làm **đầu tiên** trong Prompt 04; phần còn lại
  của bản tương thích — F01, F03, F04 → F06, F20, từ vựng, F63/F36 — ở [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03), review `P03-RV-03`):
  - Migration (A) `…_subscription_owner_column` — migration đầu tiên của Prompt 04 (tên lớn hơn migration cuối đã merge và nhỏ hơn mọi
    migration khác của gói), **chỉ cộng thêm**: `subscriptions.owner_department_id` UUID NULL (FK nullable `departments` `RESTRICT`, chỉ
    mục `subscriptions_owner_department_id_idx`) và bảng `subscription_owner_assignments` (Prisma `SubscriptionOwnerAssignment`,
    `prisma/models/catalog.prisma`): `id`, `organization_id`, `subscription_id` (FK, `UNIQUE`), `department_id` (FK), `basis_reference`
    TEXT (CHECK 2 → 200 ký tự, không trống), `operator_ref` TEXT, `environment` TEXT (CHECK `IN ('LOCAL_TEST', 'SHARED')`), `assigned_at`
    TIMESTAMPTZ(3); trigger của chính bảng gán chặn `UPDATE`, `DELETE`, `TRUNCATE` và từ chối `INSERT` khi thuê bao đã có
    `owner_department_id` (`23514`). Bảng giữ lâu dài làm hồ sơ căn cứ gán (`QĐ-89e`).
  - **(A) tương thích runtime cũ:** (A) không đặt trigger, CHECK hay `NOT NULL` nào trên `subscriptions`. Runtime `7c28e75` (không gửi phòng)
    vẫn tạo, sửa, đọc thuê bao trên schema sau (A) — trong cửa sổ `migrate deploy` → recreate của H7, sau một lượt deploy mở rộng lỗi được
    phục hồi về image cũ, và khi rollback có chủ đích bản mở rộng. Dòng `NULL` nó tạo là **dữ liệu chuyển tiếp**, không phải hỏng: kiểm kê
    sống của preflight liệt kê ID của nó.
  - **Bất biến ghi mới ở tầng ứng dụng, từ khi bản mở rộng chạy:** `SubscriptionRepo.insert` (nơi ghi duy nhất của `subscriptions`) nhận
    `ownerDepartmentId` bắt buộc ở kiểu; `subscriptionCreate` nhận `ownerDepartmentId` bắt buộc — thiếu ⟹ 422 `VALIDATION_ERROR`, phòng không
    có hoặc không `ACTIVE` trong tổ chức ⟹ 422 `SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE`. Đây là contract F02 cuối (spec D, P03-D07 = A —
    không mở lại) đưa sớm vào bản mở rộng; không suy diễn phòng.
  - **Wire bản mở rộng:** không gỡ hay đổi tên trường/operation nào; `subscriptionGet`, `subscriptionList`, `subscriptionUpdate` thêm
    `ownerDepartmentId` nullable (null ở thuê bao chưa chép); PATCH không đổi phòng sở hữu; worker không đọc cột. Prisma của bản mở rộng:
    `Subscription.ownerDepartmentId String?` + quan hệ; `prisma migrate diff` rỗng với schema mở rộng.
  - **Probe schema trước mọi truy vấn** (preflight và lệnh gán của bản mở rộng): đọc `information_schema.columns`
    (`subscriptions.owner_department_id`) và `to_regclass('public.subscription_owner_assignments')` trước khi chạy câu nào nhắc cột/bảng
    đó; không dùng delegate Prisma sinh ra cho đối tượng chưa chắc có. Chưa có (A) ⟹ preflight `READY` kèm danh sách thông tin
    `SUBSCRIPTION_OWNER_TO_ASSIGN { subscriptionId }` (chỉ đọc `subscriptions.id`), lệnh gán exit 1 `SCHEMA_NOT_READY`, không ghi; có một
    trong hai mà thiếu cái kia ⟹ preflight `BLOCKED` `SUBSCRIPTION_OWNER_SCHEMA_PARTIAL`.
  - **`ops:preflight` của bản mở rộng** (chỉ đọc): chưa có (A) ⟹ như trên, rồi `migrate deploy` exit 0 (chỉ áp (A)). Đã có (A) ⟹
    **kiểm kê sống**, tính lại ở mỗi lần chạy (không dựa ảnh chụp trước migration hay trước rollback): `BLOCKED`
    `SUBSCRIPTION_OWNER_UNASSIGNED { subscriptionId }` cho mọi thuê bao `owner_department_id IS NULL` thiếu dòng gán hợp lệ hoặc có xung đột
    — gồm dòng gán thiếu, dòng tạo muộn và dòng do runtime cũ tạo sau phục hồi/rollback — `READY` chỉ khi đủ; chặn mọi deploy tiếp (kể cả lại
    chính revision này) tới khi gán xong. Chỉ ID.
  - **Điểm dừng nội bộ:** Prompt 04 dừng **một lần** ở `expansion-ready-owner-action` sau kiểm chứng focused của mốc (plan Checkpoint E);
    agent không commit, push, deploy hay chạm máy chủ thật; tiếp tục **cùng** Prompt 04 sau Task 1.2b.
- **Mốc gán** (Task 1.2b — Owner/operator, trên mọi CSDL có dữ liệu sẽ nhận bản cuối): Owner commit/push mốc mở rộng, chờ CI, deploy;
  operator gán **từng** thuê bao theo căn cứ mua/hợp đồng đã duyệt bằng lệnh dưới — không suy diễn, không mặc định hàng loạt; `ops:preflight`
  của bản mở rộng trả `READY` = mốc khép. _Dòng gán hợp lệ_: đúng một dòng cho thuê bao, cùng `organization_id`, phòng tồn tại; _xung đột_:
  thuê bao đã có `owner_department_id` khác phòng của dòng gán, hoặc phòng thuộc tổ chức khác. Nếu deploy mở rộng lỗi và H7 phục hồi image
  cũ, hoặc bản mở rộng bị rollback, image cũ vẫn chạy; thuê bao nó tạo được lần preflight kế liệt kê và phải gán như mọi ID khác. Bản cuối
  chỉ được deploy khi **bản đang chạy là bản mở rộng** (`releases/current-image` của H7 là image mở rộng) **và** preflight `READY` — để không
  có thuê bao không chủ nào xuất hiện giữa preflight và (B). Giữ nguyên luật sao lưu (L.5), phân quyền, che dữ liệu đầu ra và dọn tài
  nguyên.
- **Lệnh:** `pnpm ops:assign-subscription-owner --subscription <id> --department <mã phòng> --basis <tham chiếu mua/hợp đồng> --operator
<tham chiếu> --environment LOCAL_TEST|SHARED` — script `"ops:assign-subscription-owner": "node dist/subscription-owner-assignment-cli"`,
  entry `src/subscription-owner-assignment-cli.ts`, capability `src/modules/catalog/subscription-owner-assignment/` (chủ bảng; không
  `installation`). Một giao dịch: thuê bao tồn tại, phòng `ACTIVE`, chèn dòng gán qua model Prisma (không SQL thô, không đọc cột phòng sở
  hữu khi còn NULL), Audit `OPERATOR` `SUBSCRIPTION_OWNER_ASSIGNMENT.RECORDED` (`operatorReference` = căn cứ; `after` `{ subscriptionId,
departmentId, basis, operator, environment }`). Không suy diễn: không gán hàng loạt, không gán theo quy tắc. Mã thoát 0 đã gán · 2 đã
  gán đúng phòng đó (không ghi) · 1 bị từ chối/lỗi, không ghi (`SUBSCRIPTION_NOT_FOUND`, `DEPARTMENT_NOT_ACTIVE`, `OWNER_ALREADY_SET` — đã
  có phòng sở hữu hoặc đã gán phòng khác). Đầu ra chỉ `subscription`, `department` (UUID), `outcome`. Đăng ký ở
  `src/operational-commands.spec.ts` và `docs/rules/operational-commands.md`.
- **Mốc thu hẹp** (Task 1.2c — chỉ sau khi bản mở rộng đã deploy và **mọi** dòng gán đã xác minh; cùng Prompt 04):
  - Migration (B) `…_subscription_owner_required` là **migration đầu tiên của bản cuối** (liền sau (A) trong lịch sử; viết sau khi tiếp tục
    Prompt 04) và **một mình** đặt ràng buộc CSDL về phòng sở hữu: khối `DO $$` **trước mọi ghi** — còn thuê bao thiếu dòng gán hợp lệ hoặc
    có xung đột ⟹ `RAISE EXCEPTION` chỉ liệt kê ID (lưới an toàn; preflight đã phải `BLOCKED`); đủ ⟹ chép phòng từ dòng gán vào thuê bao
    `NULL`, một Audit `SYSTEM` `SUBSCRIPTION.OWNER_SET_FROM_ASSIGNMENT` mỗi thuê bao (`before` `{ ownerDepartmentId: null }`, `after` `{
ownerDepartmentId, assignmentId, migration }`), rồi `SET NOT NULL`; trigger `subscriptions_owner_immutable` (F02 — `owner_department_id`
    không đổi sau khi có); trigger `license_assignments_owner_department_guard` (F20 — Assignment có `subscription_id` và
    `owning_department_id` khác NULL phải trùng `owner_department_id` của thuê bao; NULL như mã hiện có ghi cho seat cá nhân không bị chặn);
    CHECK seat cá nhân thay `license_assignments_service_has_owning_department` để seat cá nhân được mang phòng sở hữu. Áp thành công ở lượt
    `migrate deploy` bình thường **đầu tiên**.
  - **Runtime mở rộng hợp lệ trên (A) + (B)** (rollback bản cuối về image mở rộng): mọi lần tạo thuê bao có phòng (thỏa `NOT NULL`), không
    lệnh nào đổi phòng sở hữu (thỏa `subscriptions_owner_immutable`), đọc nhận giá trị khác null, seat cá nhân ghi `owning_department_id`
    NULL như hiện có và seat tài khoản dịch vụ cùng phòng với thuê bao đều ghi được. Seat lệch phòng với thuê bao — điều `QĐ-89a` cấm — bị
    guard service của bản tương thích từ chối 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` **trước** khi ghi; trigger F20 là
    phòng thủ sâu và mapper dịch nó sang cùng mã (mục K) — không 500. Mọi migration **sau** (B) của bản cuối (F01, F03, F04 → F06 có bước
    phá hủy) cũng tương thích với image này theo [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) (review `P03-RV-03`); khôi phục bản sao lưu chỉ là đường
    khẩn cấp khi operator chủ động rollback qua ranh giới phá hủy.
  - Prisma cuối `Subscription.ownerDepartmentId String`; `prisma migrate diff` rỗng với schema thu hẹp; wire đọc `ownerDepartmentId` không
    còn null.
  - **`ops:preflight` của bản cuối** (chứa (B); probe schema như bản mở rộng): CSDL đã có (A) ⟹ kiểm kê sống như mốc gán (`BLOCKED`
    `SUBSCRIPTION_OWNER_UNASSIGNED` khi còn thiếu hoặc xung đột, `READY` khi đủ); CSDL **chưa** có (A) mà còn thuê bao ⟹ `BLOCKED`
    `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED { subscriptionId }` (deploy bản mở rộng và gán trước) — dừng trước mọi migration của bản cuối;
    CSDL chưa có (A) và không có thuê bao (CSDL trống, cài mới) ⟹ `READY`, áp cả chuỗi một lượt, (B) không có gì để chép, không cần lệnh gán.
  - Mọi đường (CSDL có dữ liệu qua ba mốc, CSDL trống) kết thúc với **lịch sử migration sạch**: mỗi migration đúng một dòng
    `_prisma_migrations`, `finished_at` có giá trị, `rolled_back_at` NULL, không dòng lỗi.

#### L.4 Chức vụ và dữ liệu đổi chức vụ cũ (P03-D04, P03-D05, F03, F41)

- `employees.job_title` TEXT NULL (≤ 255, cắt khoảng trắng) ← `job_titles.name` của giai đoạn hiện hành: dòng `employee_placements` có
  `valid_from` lớn nhất ≤ ngày chạy migration theo múi giờ tổ chức; không có ⟹ dòng có `valid_from` nhỏ nhất. Là tên hiện tại của mục danh
  mục (`job_titles` không lưu lịch sử tên).
- Lịch sử chỉ đọc, không API: `employee_placements.job_title_name`, `department_transfers.from_job_title_name`, `to_job_title_name`,
  `transfer_reviews.job_title_name` TEXT NULL ← `job_titles.name` theo khóa cũ; một hàm trigger dùng chung `history_job_title_name_frozen`
  (`INSERT` phải NULL, `UPDATE` không đổi giá trị). Sau đó bỏ bốn cột `job_title_id`, CHECK `department_transfers_something_changes_check`
  và bảng `job_titles`. `src` không đọc/ghi các cột lịch sử.
- `JOB_TITLE_CHANGE` và điều chuyển chỉ đổi chức vụ: giữ dòng cũ làm lịch sử; giá trị `PersonnelNoticeKind.JOB_TITLE_CHANGE` giữ (wire đọc
  còn giá trị, wire ghi không nhận). Ràng buộc CSDL cấm dòng mới của phương án A hiện thực bằng trigger `BEFORE INSERT`
  `personnel_notices_no_retired_kind` (kind `JOB_TITLE_CHANGE`) và `department_transfers_department_changes` (`from_department_id =
to_department_id`), vì CHECK `NOT VALID` vẫn chặn cập nhật hợp lệ của dòng lịch sử (đóng hồ sơ điều chuyển).
- **Dòng đang chờ — _hủy với lý do_:** CHECK hiện có buộc dòng `REJECTED`/`CANCELLED` có người dùng thực hiện mà migration không có ⟹ hủy
  **trước** deploy bằng thao tác hiện có của bản đang chạy: `BM-09` `JOB_TITLE_CHANGE` `PENDING_VERIFICATION` ⟹ từ chối, lý do `Loại BM-09
đã bỏ (QĐ-87e, D-1)`; điều chuyển `PENDING` chỉ đổi chức vụ ⟹ hủy, lý do `Điều chuyển chỉ đổi chức vụ đã bỏ (QĐ-87e, D-1)`.
  `ops:preflight` `BLOCKED` khi còn: `PERSONNEL_NOTICE_RETIRED_KIND_PENDING { noticeId }`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING {
transferId }` (chỉ ID); migration có khối `DO $$ RAISE` cùng điều kiện, không ghi gì.
- **Thời điểm** (review `P03-RV-03`, [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)): chép `employees.job_title` (luật trên, _ngày chạy migration_ = ngày
  chạy migration của **bản tương thích**) và bỏ `NOT NULL` của bốn cột `job_title_id` ở bản tương thích; cột lịch sử `job_title_name`, các
  trigger và việc bỏ cột/bảng ở bản cuối (không chép lại `employees.job_title`). Dòng chờ của loại đã bỏ từ chối/hủy trên **bản tương thích
  đang chạy** (hoặc `7c28e75` trước đó) bằng thao tác hiện có — bản tương thích vẫn có từ chối `BM-09` và hủy điều chuyển, chỉ không nhận
  dòng mới của loại đã bỏ.
- **Hợp đồng ứng dụng của bản tương thích** (Task 1.3a, ghi khi triển khai; không đổi quyết định `P03-D04`, `P03-D05`):
  `employeeCreate` nhận `jobTitle` chữ tự do — **vẫn bắt buộc** (`JOB_TITLE_REQUIRED`), thêm lý do `JOB_TITLE_TOO_LONG` khi dạng hiển
  thị dài hơn 255 ký tự (đếm ký tự, khớp CHECK `employees_job_title_shape`), cùng một chính sách đặt chỗ cho form và import; không còn
  `JOB_TITLE_NOT_FOUND`/`JOB_TITLE_INACTIVE`. Phản hồi điều chuyển bỏ `changes` và `jobTitle` của `from`/`to`; thân ghi nhận
  `toDepartmentId` bắt buộc, trường lạ (`toJobTitleId`) ⟹ 422 `VALIDATION_ERROR` (thân strict), cùng phòng ⟹ `NO_CHANGE`. `BM-09`:
  loại gửi được gồm năm loại (`JOB_TITLE_CHANGE` ⟹ 422 `VALIDATION_ERROR` trước khi kiểm quyền); dòng cũ loại đó vẫn đọc và từ chối được,
  ghi nhận ⟹ 422 `DEPARTMENT_TRANSFER.NO_CHANGE` (không có phòng đích). Mục danh mục `job_titles` còn đó chỉ để bản `7c28e75` đọc
  (trigger `job_title_id_backfill` tạo/khớp theo tên chuẩn hóa); `@ignore` và bỏ nốt phần đọc ở cuối Task 1.4a cùng bộ chuẩn.

#### L.5 Gỡ bộ chuẩn, phân bổ, chuyển phòng tài khoản dịch vụ và bản sao lưu (P03-D06, F04, F05, F06)

- **Bỏ** (Task 1.4): bảng `standard_toolsets`, `standard_toolset_versions`, `standard_toolset_items`, `subscription_cost_allocations`,
  `subscription_cost_allocation_versions`, `subscription_cost_allocation_lines`, `service_account_moves` cùng hàm/trigger của chúng
  (`standard_toolset_*`, `subscription_cost_allocation_*`, `service_account_move_guard`); cột `access_requests.outside_standard`,
  `outside_standard_reason`. Không giữ bảng chỉ đọc.
- **Dòng `service_account_moves` `PENDING`:** hủy **trước** deploy bằng `serviceAccountMoveCancel` của bản đang chạy, lý do `Chuyển phòng
tài khoản dịch vụ đã bỏ (QĐ-89c)` (CHECK `service_account_moves_state_together` buộc người dùng hủy); `ops:preflight` `BLOCKED`
  `SERVICE_ACCOUNT_MOVE_PENDING { moveId }`; migration có khối `DO $$ RAISE` cùng điều kiện, không ghi gì.
- **Thời điểm** (review `P03-RV-03`, [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)): bản tương thích gỡ `serviceAccountMove*` và không đọc
  `service_account_moves` ⟹ dòng `PENDING` hủy trên **`7c28e75`** trước khi deploy bản tương thích; `ops:preflight` của bản tương thích
  `BLOCKED` `SERVICE_ACCOUNT_MOVE_PENDING` (chỉ ID) khi còn. Dòng do `7c28e75` tạo sau lần preflight đó (cửa sổ deploy, sau khi H7 phục hồi
  image cũ) ⟹ `ops:preflight` của bản tương thích và bản cuối `BLOCKED`; operator rollback có chủ đích về `7c28e75` (hợp lệ trên schema bản
  tương thích — L.10), hủy bằng thao tác của nó, deploy lại bản tương thích. Không SQL tay, không xóa dòng.
- **Bản `pg_dump` trước bước phá hủy là tài liệu sao lưu vận hành được bảo vệ** (chứa dữ liệu cá nhân):
  - không bao giờ commit vào Git — không nằm trong cây làm việc của repo nào;
  - không đăng làm artifact CI công khai hay dùng chung (không `actions/upload-artifact`, không đính release, không gửi chat/issue/PR);
  - lưu ở vị trí sao lưu được bảo vệ: trên VPS là thư mục sao lưu của bước deploy hiện có
    `<APP_DIR>/backups/postgres/slm-pre-migrate-<UTC yyyyMMddTHHmmssZ>-<short sha>.dump` (thư mục `0700`, `umask 077`, ghi bằng deploy
    role, giữ theo `scripts/ops/postgres-backup-retention.sh` — `docs/guides/containers.md` _Backup before production migrations_); bản
    diễn tập của Prompt 04 ở thư mục tạm riêng **ngoài** mọi repo, chỉ người chạy đọc được, xóa khi dọn tài nguyên; sao ra ngoài host chỉ
    tới nơi có cùng kiểm soát truy cập như CSDL;
  - bằng chứng gói/release chỉ ghi **SHA-256**, thời điểm UTC, revision (SHA BE và tên migration cuối đã áp trước đó) và **tham chiếu
    vị trí được bảo vệ** (tên tệp và nhãn host/thư mục) — không URL công khai, không nội dung;
  - giữ nguyên `ops:preflight` đóng khi lỗi (exit 2 dừng deploy trước migration) và rollback bằng khôi phục bản sao vào CSDL mới (không có
    down — `DB-05`) — **chỉ** khi operator chủ động rollback qua ranh giới phá hủy; deploy lỗi thông thường được H7 phục hồi về image
    tương thích mà không khôi phục CSDL (L.10);
  - Prompt 04 kiểm: `git ls-files '*.dump' '*.backup' '*.sql.gz'` rỗng; `git status --porcelain -uall` không có tệp sao lưu;
    `.github/workflows/*.yml` không có bước tải lên đường sao lưu.

#### L.6 Thay đổi phá vỡ contract (P03-D07)

- Gỡ trực tiếp một lượt 17 operation (`jobTitle*` ×5, `standardToolset*` ×5, `subscriptionCostAllocation*` ×3,
  `licenseAssignmentProposeDepartmentMove`, `serviceAccountMoveList`, `serviceAccountMoveConfirm`, `serviceAccountMoveCancel`) và mọi
  trường/mã gỡ hoặc đổi kiểu ở [impact matrix mục 6](impact-matrix.md#6-contract-và-bàn-giao-femobile) (gồm L.1, L.2); không 410, không
  cửa sổ deprecation, không cờ tương thích. Route gỡ trả 404 như route không tồn tại (không handler riêng); registry collection bỏ mục theo
  luật sự kiện registry (Task 6.1). Bàn giao FE/Mobile là impact matrix mục 6.
- **Thời điểm** (review `P03-RV-03`, [mục L.10](#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)): operation và trường mà bản cuối bỏ bảng/cột lưu trữ — `jobTitle*`,
  `standardToolset*`, `subscriptionCostAllocation*`, `licenseAssignmentProposeDepartmentMove`, `serviceAccountMove*`, `outsideStandard*`,
  chức vụ trên thân điều chuyển/`BM-09` — gỡ ngay ở **bản tương thích**; phần còn lại của danh sách ở bản cuối. Vẫn không 410, không cửa sổ
  deprecation.

#### L.7 PATCH thuê bao khi phòng chưa có Cost Center (P03-D09, F26)

- `subscriptionUpdate` ⟹ 409 `FINANCE.SETUP_INCOMPLETE` (mã của F27) khi phòng sở hữu không có Cost Center hiện hành **và** thân lệnh
  tạo, tăng hay kéo dài nghĩa vụ: tăng `purchasedQuantity`; dời `endDate` hoặc `renewalDate` muộn hơn (hoặc đặt khi đang trống);
  `autoRenew` `false → true`; tăng `unitPrice`. Mọi sửa khác (giảm, đính chính không tăng/kéo dài, trường mô tả) vẫn được. So với giá trị
  đang lưu dưới khóa dòng thuê bao; kiểm ở policy service.

#### L.8 Nguồn giá của Request (P03-D11, F38)

- `SubscriptionRepo.findPricedOfPlan(planId, ownerDepartmentId, tx)` thêm điều kiện phòng sở hữu = phòng của Request; thứ tự giữ nguyên
  (`startDate` mới nhất, rồi `id`); không có ⟹ nhánh hiện có khi không có giá thuê bao (giá gói/báo giá `BM-02`). Không bao giờ lấy thuê
  bao của phòng khác.

#### L.9 Disposition không chặn

- P03-D10, P03-D12, P03-D13, P03-D14, P03-D15: mặc định khuyến nghị **A** áp dụng cho Prompt 04 (Owner không đổi tới 27/10/2026). Đổi về
  sau là quyết định Owner mới, ghi ở bảng disposition trước khi task bị ảnh hưởng bắt đầu; Prompt 04 không hỏi lại.

#### L.10 Ranh giới bản tương thích và bản cuối (review `P03-RV-03`)

- **Vì sao** (review `P03-RV-03`, 27/10/2026 — sửa review trong Prompt 03 gắn F01, F03, F04 → F06, F20; không phải F68, không phải quyết định
  Owner mới): H7 chạy sao lưu → `ops:preflight` → `migrate deploy` → `ops:db-roles reconcile` rồi mới promote và recreate `api`/`worker`/`caddy`,
  chờ sẵn sàng tối đa 120 s rồi theo dõi 20 s; lỗi trước promote giữ image đang chạy, lỗi sau promote dựng lại image của
  `releases/current-image` trên CSDL **đã** migrate và không hoàn tác migration nào (`scripts/ops/deploy-release.sh`;
  `docs/guides/containers.md` _Deploys after H7_). Trong cửa sổ sẵn sàng image mới đã nhận traffic và chạy job. Thiết kế trước đó để bản cuối
  chạy (B) rồi các migration phá hủy F01, F03, F04 → F06 trong khi image đang chạy/được phục hồi còn dùng đối tượng bị xóa, và seat lệch phòng
  sau (B) thành 500 chưa ánh xạ. Bản `pg_dump` là tài sản khôi phục khẩn cấp, không phải cách hoàn tất hay phục hồi một lượt deploy thường.
- **Ba revision, một điểm dừng:** `7c28e75` (đang chạy) → **bản tương thích** (tên chung của _bản mở rộng_ ở L.3; Task 1.1a, 1.2a, 1.3a, 1.4a,
  1.9a, 3.2a, 4.7a; điểm dừng duy nhất `expansion-ready-owner-action`) → **bản cuối** (migration thu hẹp/phá hủy ở đầu Phase 1, rồi hành vi
  còn lại). Không có điểm dừng thứ hai.
- **Bất biến ranh giới** — mỗi migration của một revision hợp lệ với image chạy **trước** nó, trong cửa sổ `migrate deploy` → recreate và sau
  khi H7 phục hồi image đó:
  1. **`7c28e75` trên schema của bản tương thích:** migration của bản tương thích chỉ cộng thêm hoặc nới (cột/bảng mới nullable hay có mặc
     định, bỏ `NOT NULL` ở cột `7c28e75` luôn ghi, hàm kiểm nhận thêm NULL, chỉ mục duy nhất mà dữ liệu `7c28e75` luôn thỏa); không trigger,
     CHECK hay `NOT NULL` nào từ chối một lệnh ghi `7c28e75` làm được. Dòng `7c28e75` ghi sau migration được trigger đồng bộ chép sang dạng
     mới, hoặc được kiểm kê sống của preflight liệt kê (D03 — L.3). Dòng bản tương thích ghi vẫn đọc được bằng `7c28e75`: bản tương thích giữ luật của `7c28e75` ở mọi giá trị `7c28e75` đọc (chức vụ bắt buộc khi tạo; không tạo phòng thiếu Cost Center khi `7c28e75` còn là đích phục hồi — tạo phòng chờ bước kích hoạt của L.11) và trigger đồng bộ ngược điền
     cột cũ.
  2. **Bản tương thích trên schema của bản cuối:** migration của bản cuối không xóa đối tượng nào bản tương thích còn nhắc; mọi ràng buộc mới
     nhận mọi lệnh ghi bản tương thích làm được, hoặc bản tương thích từ chối trước bằng 4xx đã ánh xạ; bản tương thích đọc được mọi dòng bản
     cuối có thể ghi trong cửa sổ sẵn sàng (**đồng thuận từ vựng**: mọi giá trị enum, mọi cột bản cuối có thể để NULL ở dòng bản tương thích
     đọc).
  3. **Đồng thuận ngữ nghĩa:** migration của bản cuối nào viết lại dữ liệu cũ theo nghĩa cũ (chép phòng sở hữu ở (B), đối soát `RETURNED` ở
     J.2, tách bản nháp F36, tên chức vụ lịch sử) thì bản tương thích đã ghi dạng sau-migration ⟹ không dòng dạng cũ nào xuất hiện sau
     migration, kể cả khi bản tương thích được phục hồi. Dòng dạng cũ chỉ còn từ `7c28e75` và được migration của bản cuối xử lý lúc chạy.
  4. **Phục hồi không cần CSDL:** lỗi sau `migrate deploy`, `reconcile`, promote hay kiểm sẵn sàng ⟹ H7 dựng lại image trước, mọi đọc/ghi được
     hỗ trợ của nó làm được, **không** khôi phục CSDL. `pg_dump` (L.5) chỉ dùng khi operator **chủ động** rollback qua ranh giới phá hủy (ví dụ về `7c28e75` sau khi bản cuối đã chạy). Rollback có chủ đích về `7c28e75` chỉ hợp lệ tới trước bước kích hoạt của L.11; sau đó cũng là đường khẩn cấp.
     _Sửa 28/10/2026 (`P04-CPE-04`, [L.12](#l12-đích-quay-về-phải-đọc-được-dữ-liệu-p04-cpe-04-prompt-04-mục-910-28102026)):_ bất biến 2 và 4
     không đúng vô điều kiện từ F91 — bản cuối ghi Request đã trình không Cost Center mà `fba4dfe` không đọc được; image trước chỉ được dựng
     lại khi `ops:preflight --recovery-target` nói nó đọc được mọi dòng đang có.
- **API/worker của bản tương thích không nhắc đối tượng sắp xóa:** cột → `@ignore`, model → `@@ignore` trong `prisma/models/*.prisma` của bản
  tương thích. Nguồn: tham chiếu schema Prisma — `@ignore`/`@@ignore`: _"Ignored fields are excluded from the generated Prisma Client"_,
  _"Ignored models are excluded from the generated Prisma Client"_, và `create` bị tắt nếu trường bắt buộc không có `@default`
  (<https://www.prisma.io/docs/orm/reference/prisma-schema-reference>); trang **không** nói Prisma Migrate có quản lý tiếp đối tượng bị bỏ
  qua ⟹ **UNVERIFIED**: Checkpoint E chứng minh bằng `prisma migrate diff` rỗng với schema bản tương thích; không rỗng ⟹ dừng và báo, không
  nới gate. Raw SQL trong `src` (trừ `src/generated`) không nhắc tên đối tượng sắp xóa (gate tĩnh). Ngoại lệ duy nhất: `ops:preflight`
  chạy **trước** migration và đọc đối tượng sắp xóa chỉ sau probe schema (như L.3) để liệt kê dòng phải dọn.
- **Đối tượng chuyển qua điểm dừng:**

| Finding                                | Bản tương thích — migration (cộng thêm, tương thích `7c28e75`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Bản tương thích — chuyển ứng dụng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bản cuối — thu hẹp/xóa                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F02 (D03)                              | (A) như L.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `ownerDepartmentId` bắt buộc khi khai (L.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | (B) như L.3                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F20                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | guard service trước khi ghi Assignment trả phí ⟹ 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`, 0 ghi; mapper dịch `23514` có constraint `license_assignments_owner_department_guard` sang cùng mã (mục K)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | trigger `license_assignments_owner_department_guard` trong (B) — phòng thủ sâu                                                                                                                                                                                                                                                                                                                                                     |
| F01                                    | `cost_centers.department_id` UUID NULL (FK `RESTRICT`), `linked_at` NULL — chép 1–1 từ `departments.cost_center_id` (`linked_at` = mốc tạo **muộn** hơn của cặp, `GREATEST(c.created_at, d.created_at)` — F68); CHECK `cost_centers_link_together`; `cost_centers_one_active_per_department` `UNIQUE (department_id) WHERE status = 'ACTIVE'`; trigger `cost_centers_department_link_once`; `departments.cost_center_id` bỏ `NOT NULL`, `departments_require_unit_cost_center()` nhận NULL; trigger đồng bộ `departments_cost_center_link_forward` (`7c28e75` tạo phòng ⟹ gắn Cost Center) và `cost_centers_department_link_backward` (Cost Center `ACTIVE` có phòng ⟹ cột cũ trỏ tới nó); bảng `cost_center_department_links`, `cost_center_direction_activations` (L.11). Cost Center `7c28e75` thiếu liên kết là dữ liệu chuyển tiếp, vào kiểm kê sống | mọi đọc Cost Center của phòng qua `cost_centers.department_id` (Cost Center `ACTIVE` gắn phòng); `Department.costCenterId` `@ignore`; `costCenterCreate` contract cuối (`departmentId` bắt buộc, liên kết trong cùng câu chèn — không tạo Cost Center tự do); `departmentCreate` contract cuối (Super Admin, `hrBasis`, không `costCenterId`) — 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION` tới khi kích hoạt; lệnh `pnpm ops:cost-center-direction` (`activate`, `link`); preflight `COST_CENTER_UNLINKED`, `COST_CENTER_LINK_MISMATCH`; đọc chịu được phòng không có Cost Center (`costCenter`nullable); mọi đường suy ra Cost Center từ phòng mà không có ⟹ 409`FINANCE.SETUP_INCOMPLETE` (phần từ chối của F27, không có nháp) — L.11 | `…_cost_center_belongs_to_department` (Task 1.1): khối `DO $$` trước mọi ghi `RAISE` chỉ ID khi còn Cost Center thiếu phòng, lệch cột cũ hay tổ chức chưa kích hoạt; rồi `department_id`, `linked_at` `SET NOT NULL`; bỏ hai trigger đồng bộ, `departments_unit_cost_center` và hàm, cột `departments.cost_center_id`; viết lại guard tài khoản dịch vụ đọc liên kết mới; giữ hai bảng của L.11. Không Cost Center nào thiếu phòng |
| F03, F41                               | `employees.job_title` TEXT NULL (≤ 255, cắt khoảng trắng) ← L.4; bốn cột `job_title_id` bỏ `NOT NULL`; trigger `employees_job_title_forward` (`7c28e75` tạo Employee/giai đoạn ⟹ điền `employees.job_title` khi NULL); trigger `BEFORE INSERT` `job_title_id_backfill` trên giai đoạn (mục `job_titles` khớp tên chuẩn hóa của `employees.job_title`; không có ⟹ chèn mục `ACTIVE` tên đó), điều chuyển và rà soát (id của giai đoạn hiện hành)                                                                                                                                                                                                                                                                                                                                                                                                           | đọc/ghi chức vụ qua `employees.job_title`; bốn trường `job_title_id` `@ignore`, `JobTitle` `@@ignore`; gỡ `jobTitle*`; nhập tay/import nhận chữ tự do nhưng **giữ bắt buộc** như `7c28e75` (bỏ bắt buộc ở bản cuối); `BM-09` `JOB_TITLE_CHANGE` và điều chuyển chỉ đổi chức vụ bị từ chối 422 `VALIDATION_ERROR` (thân ghi không còn nhận), trước khi ghi; từ chối/hủy dòng chờ cũ vẫn làm được                                                                                                                                                                                                                                                                                                                                             | L.4: `job_title_name` ← `job_titles.name` theo khóa cũ, `history_job_title_name_frozen`, `personnel_notices_no_retired_kind`, `department_transfers_department_changes`; bỏ trigger đồng bộ, bốn cột `job_title_id`, `department_transfers_something_changes_check`, bảng `job_titles`                                                                                                                                             |
| F04                                    | — (`outside_standard` `NOT NULL DEFAULT false`, `outside_standard_reason` nullable — bỏ qua được)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | gỡ `standardToolset*` (×5), _ngoài bộ chuẩn_ khỏi mọi đường Request (Task 4.2 cũ), gợi ý bộ chuẩn của checklist; rà soát sau điều chuyển phủ **mọi** quyền cá nhân đang giữ (phạm vi F42 — không còn so bộ chuẩn); ba model `@@ignore`, hai cột `@ignore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | L.5: bỏ ba bảng + hàm/trigger + hai cột                                                                                                                                                                                                                                                                                                                                                                                            |
| F05                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | gỡ `subscriptionCostAllocation*` (×3) và mọi đọc phân bổ ở `catalog`/`finance`; ba model `@@ignore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | L.5: bỏ ba bảng + hàm/trigger                                                                                                                                                                                                                                                                                                                                                                                                      |
| F06                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | gỡ `licenseAssignmentProposeDepartmentMove`, `serviceAccountMoveList`, `serviceAccountMoveConfirm`, `serviceAccountMoveCancel` và mọi đọc `service_account_moves`; model `@@ignore`; preflight của bản tương thích `BLOCKED` `SERVICE_ACCOUNT_MOVE_PENDING` (L.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | L.5: bỏ bảng + `service_account_move_guard`                                                                                                                                                                                                                                                                                                                                                                                        |
| Từ vựng (F19, F21, F27, F29, F62, F65) | **sáu** câu `ALTER TYPE … ADD VALUE` cho tám giá trị ngữ nghĩa: `AccessRequestState.DRAFT`, `AccessRequestCancelCause.BENEFICIARY_TRANSFERRED` (nguyên nhân đóng của Request **và** của dòng nhóm — `access_request_lines.cancel_cause` dùng lại chính enum `AccessRequestCancelCause`, không có enum riêng nên không có câu `ADD VALUE` thứ hai), lý do đóng của tác vụ cấp phát (cột TEXT, không phải enum, không có câu `ADD VALUE`), `RevocationSource.POST_SETUP_REVIEW`, `BudgetVersionState.EXPIRED`, `BudgetProposalState.CLOSED_FISCAL_YEAR_ENDED`, `BudgetCheckTrigger.FINANCE_OUTCOME_WHILE_WAITING` (chỉ `ADD VALUE`, không dùng giá trị trong cùng migration — `DB-05`); mười cột người thực hiện của L.2 bỏ `NOT NULL`                                                                                                                      | Prisma/mapper/wire biết mọi giá trị (switch toàn phần, enum phản hồi cộng thêm); Request `DRAFT` không hiện ở mọi đọc (404, không liệt kê); trường người thực hiện nullable trên đọc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | migration cấu trúc của Task 1.6, 1.7, 1.8 — không còn migration giá trị                                                                                                                                                                                                                                                                                                                                                            |
| F63, F36                               | `budget_versions.detached_at` TIMESTAMPTZ(3) NULL (chưa CHECK, chưa đổi chỉ mục)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | quyết định từ chối phiên bản **giữ** đề xuất `REVIEWED` (bỏ nhánh trả `RETURNED` — `version-decision.service.ts:87-95`); rút/trả lại đề xuất đặt `detached_at` cho bản `DRAFT` của nó trong cùng giao dịch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | J.1; J.2 (chỉ còn dòng do `7c28e75` tạo); CHECK `detached_at` (mục K F36) + `budget_versions_in_flight_key` mới; backfill F36 chỉ cho bản nháp chưa có `detached_at`                                                                                                                                                                                                                                                               |
| F48                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | bộ đếm theo năm (mục K F48) cấp số = 1 + lớn hơn của `last_value` và số lớn nhất đã dùng của năm đó (đọc dưới khóa dòng đếm), rồi `setval` sequence cũ lên ít nhất số đó trong cùng giao dịch ⟹ bản tương thích được phục hồi (vẫn dùng sequence) không cấp lại số bản cuối đã cấp, và ngược lại                                                                                                                                   |

- **Các migration còn lại của bản cuối** (Task 1.5 nới chỉ mục/CHECK; Task 1.6 cấu trúc nháp; Task 1.7 phần còn lại; Task 1.8 phiếu; F47) đã
  đối chiếu với bất biến 2: chỉ nới, hoặc chỉ ràng buộc cột/dòng bản tương thích không ghi (cột kế tiếp/lịch sử/giữ chờ/phiếu), hoặc bản
  tương thích thỏa sẵn (luôn ghi Cost Center của Request vì đã từ chối 409 khi phòng không có; luôn ghi cột người dùng; chỉ mục
  `budget_proposals_open_key` mới giữ tên cũ nên mapper hiện có của bản tương thích vẫn trả 409 `BUDGET.PROPOSAL_ALREADY_OPEN`).
- **Thứ tự deploy và việc Owner/operator** (Task 1.2b): (1) trên `7c28e75`: hủy `service_account_moves` `PENDING` với lý do L.5; (2) commit/push
  bản tương thích, chờ CI, deploy bằng quy trình H7 thường; (3) trên bản tương thích đang chạy, **sau** khi H7 báo sẵn sàng và tracker ghi SHA image: `pnpm ops:cost-center-direction activate`, rồi liên kết từng Cost Center thiếu phòng theo căn cứ (`link`; chưa có phòng hợp lệ ⟹ Super Admin tạo phòng thật trước — L.11), gán phòng sở hữu từng thuê bao (L.3), từ chối
  `BM-09` `JOB_TITLE_CHANGE` chờ và hủy điều chuyển chờ chỉ đổi chức vụ (L.4), ca mơ hồ J.2 theo ID do Owner/operator xử lý; (4)
  `ops:preflight` của bản tương thích tính lại **mọi cổng hợp đồng** của bản cuối (`SUBSCRIPTION_OWNER_UNASSIGNED`,
  `PERSONNEL_NOTICE_RETIRED_KIND_PENDING`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING`, `SERVICE_ACCOUNT_MOVE_PENDING`,
  `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS`, `COST_CENTER_UNLINKED`, `COST_CENTER_LINK_MISMATCH`) và phải `READY` trong khi image đang chạy là image tương thích; (5) tracker ghi SHA image đang
  chạy và bằng chứng; (6) chỉ sau đó deploy bản cuối — `ops:preflight` của bản cuối tính lại cùng các cổng (thêm `COST_CENTER_DIRECTION_NOT_ACTIVATED`) và dừng **trước** mọi migration
  nếu còn mở.
- **Hợp đồng F20 chốt (bổ sung Prompt 04):** driver adapter của Prisma chỉ đưa ra `code` và `message` của lỗi do trigger ném, **không** đưa
  trường `CONSTRAINT`; mapper `toAssignmentFailure` nhận trigger F20 qua **message**, nên message của `license_assignments_owner_department_guard`
  phải mở đầu bằng tên constraint (`RAISE EXCEPTION 'license_assignments_owner_department_guard: …' USING ERRCODE = '23514', CONSTRAINT = '…'`).
- **Hợp đồng F20 chốt:** mục K (422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`); cùng mã ở mapper, ví dụ OpenAPI và test của bản
  tương thích và bản cuối.
- **Chứng minh** (test matrix Phase 1 dòng _ranh giới_, mục _Diễn tập_ bước 3 → 8; Prompt 04 § 1A, § 3 bước 5): image tương thích thật qua
  **từng** migration của bản cuối (đọc/ghi được hỗ trợ trước và sau mỗi migration); đối tượng F01/F03/F04 → F06 không được image tương thích
  dùng trước khi bị xóa (gate tĩnh + `pg_stat_user_tables` + nhật ký câu lệnh của CSDL diễn tập); lỗi giả lập sau `migrate deploy`,
  `reconcile`, promote, kiểm sẵn sàng ⟹ H7 phục hồi image tương thích, đọc/ghi **nghiệp vụ** (không chỉ health) xanh, không khôi phục CSDL;
  F20 ⟹ 422 cố định, 0 ghi, trước và sau trigger; F01 (L.11): image tương thích tạo phòng không Cost Center và Cost Center cho phòng sau **mỗi** migration bản cuối và sau phục hồi H7, ghi của image ứng viên trước một lượt deploy tương thích lỗi được `7c28e75` đọc lại, Cost Center tự do muộn của `7c28e75` vào kiểm kê; gate đồng thuận schema bản tương thích ↔ bản cuối; preflight chặn trước migration khi
  dọn/gán chưa xong; CSDL trống áp cả chuỗi; lịch sử migration sạch.
- **Số ranh giới deploy** (review `P03-RV-04` thay đoạn _không cần điểm dừng thứ hai_ của `P03-RV-03`): vẫn **ba revision, một điểm dừng**, không deploy boundary thứ hai; thêm **một bước kích hoạt** của operator trong Task 1.2b — cơ chế Owner duyệt 27/10/2026 vì một binary không thỏa cả hai cửa sổ H7 của F01 (chứng minh ở L.11). Không còn ngoại lệ nào cho Cost Center thiếu phòng: schema cuối `cost_centers.department_id`, `linked_at` NOT NULL (`QĐ-87d`(1)); Cost Center `7c28e75` thiếu liên kết được liên kết theo căn cứ trước khi bản cuối deploy.
- **Giới hạn còn lại (thật):** (a) trong thời gian chạy bản tương thích, chức vụ bắt buộc như `7c28e75` và trước bước kích hoạt không tạo được phòng (409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION` — L.11);
  lập lại phiên bản và đề xuất kế tiếp sau khi bị từ chối chờ bản cuối (bản tương thích trả 409 hiện có `BUDGET.PROPOSAL_NOT_SUBMITTED`,
  `BUDGET.PROPOSAL_ALREADY_OPEN`); (b) dòng bản cuối ghi trong cửa sổ sẵn sàng rồi image tương thích được phục hồi: đọc được, nhưng thao tác chỉ
  có ở bản cuối (nháp, lịch sử sửa F66, thông báo F67, đóng cuối năm) chờ bản cuối deploy lại; sửa phiên bản do image tương thích được phục
  hồi chỉ có ở Audit Trail, không có dòng `budget_version_history`; (c) rollback có chủ đích về `7c28e75` sau khi bản cuối đã chạy là đường
  khẩn cấp bằng `pg_dump` (bất biến 4); (d) sau bước kích hoạt, rollback có chủ đích về `7c28e75` cũng là đường khẩn cấp (L.11).

#### L.11 Cost Center luôn thuộc một phòng: chuyển tiếp và bước kích hoạt (review `P03-RV-04`)

- **Vì sao** (review `P03-RV-04`, 27/10/2026 — sửa review trong Prompt 03 gắn F01; không phải F68, không phải disposition nghiệp vụ mới): cách
  đóng `P03-RV-03` để `cost_centers.department_id`/`linked_at` NULL vĩnh viễn cho Cost Center chưa từng gắn phòng là ngoại lệ không có nguồn.
  Nguồn pin `e0cb5a0`, `Decisions/project-decisions.md` `QĐ-87d`(1): _"Super Admin tạo Department **trước**; Finance tạo Cost Center `Unit`
  **cho** một Department đã có và liên kết 1–1. Department được tồn tại … khi **chưa** có Cost Center … mỗi Cost Center thuộc **đúng một**
  Department suốt vòng đời, không chuyển sang phòng khác"_. Phòng thiếu Cost Center là trạng thái hợp lệ; Cost Center thiếu phòng thì không.
  Dòng do `7c28e75` ghi chỉ được thiếu liên kết **trong** thời gian chuyển tiếp và không qua được cổng của bản cuối.
- **Chứng minh một image không đủ cho hai cửa sổ** (đọc mã `7c28e75`, chỉ đọc):
  - `7c28e75` không đọc được phòng thiếu Cost Center: `src/modules/organization/department/department.repo.ts:36` đọc phòng bằng `JOIN
cost_centers c ON c.id = d.cost_center_id` (inner join — phòng thiếu Cost Center biến khỏi danh sách, chi tiết 404); schema phản hồi bắt
    buộc `costCenter` (`department.dto.ts:56`); `Department.costCenterId String @unique` không null (`prisma/models/organization.prisma:144`);
    `src/modules/organization/employee/import-lookup.repo.ts:28` cùng inner join; `access-request.service.ts:100` dùng `unit.costCenter.id`
    không kiểm null. `7c28e75` không có thao tác kích hoạt lại Cost Center và không đổi Cost Center của phòng (`department.dto.ts:19`).
  - **Cửa sổ 1** (deploy bản tương thích: H7 migrate → recreate → sẵn sàng ≤ 120 s + 20 s, image ứng viên nhận traffic; lỗi ⟹ dựng lại
    `7c28e75` trên CSDL đã migrate — `scripts/ops/deploy-release.sh` `recover()`): mọi dòng image tương thích ghi khi đang chạy phải đọc được
    bằng `7c28e75` ⟹ trong cửa sổ này image tương thích **không** được tạo phòng thiếu Cost Center.
  - **Cửa sổ 2** (deploy bản cuối: lỗi ⟹ dựng lại image tương thích trên schema đã thu hẹp): image tương thích phải tạo phòng không Cost Center
    và tạo Cost Center cho phòng đã có — đường tạo phòng **duy nhất** hợp lệ khi không còn Cost Center tự do (`QĐ-87d`(1)).
  - Tạo phòng trong cửa sổ 1 chỉ còn ba cách: từ chối; ghi dòng `7c28e75` không đọc được; hoặc tạo Cost Center trước phòng (trái `QĐ-87d`).
    Một binary không có cơ chế bật thêm không thỏa cả hai cửa sổ. Bật theo schema (chỉ tạo phòng khi cột cũ đã bỏ) gây **bế tắc**: Cost Center
    tự do chưa có phòng hợp lệ cần Super Admin tạo phòng trước, mà bản cuối bị chặn tới khi liên kết xong.
- **Cơ chế được Owner duyệt (27/10/2026, trong phiên Prompt 03; phương án còn lại — một deploy boundary thứ hai — bị loại):** vẫn **một** bản
  tương thích, **một** điểm dừng `expansion-ready-owner-action`, thêm **một bước kích hoạt** do operator chạy trong Task 1.2b **sau** khi H7
  báo bản tương thích sẵn sàng. Trước kích hoạt `departmentCreate` trả 409 đã ánh xạ (cửa sổ 1 và vài phút sau đó — giới hạn có biên được Owner
  chấp nhận); sau kích hoạt image tương thích tạo phòng không Cost Center. Không deploy boundary thứ hai, không cờ cấu hình, không đổi
  disposition P03-D01 → P03-D16.
- **Schema của bản tương thích** (migration `…_cost_center_department_link` của Task 1.1a — chỉ cộng thêm/nới; `7c28e75` không ghi bảng mới và
  không cập nhật hai cột mới):
  - `cost_centers.department_id` UUID NULL (FK `departments` `RESTRICT`), `linked_at` TIMESTAMPTZ(3) NULL — chép 1–1 từ
    `departments.cost_center_id` (`linked_at` = mốc tạo **muộn** hơn của cặp, `GREATEST(c.created_at, d.created_at)` — F68: `7c28e75` chỉ ghi liên kết
    một lần, lúc chèn dòng phòng quanh một Cost Center đã có, và không bao giờ đổi Cost Center của phòng — nên mốc đó không sớm hơn một trong hai dòng; mốc
    sớm hơn làm Cost Center hiện hành trước khi phòng tồn tại, trái `QĐ-87d`(3)); CHECK `cost_centers_link_together` (`(department_id IS NULL) =
(linked_at IS NULL)`); `cost_centers_one_active_per_department` `UNIQUE (department_id) WHERE status = 'ACTIVE'` (mỗi phòng `7c28e75` có
    đúng một Cost Center và không có kích hoạt lại ⟹ không ghi nào của `7c28e75` vi phạm); trigger `cost_centers_department_link_once`
    (`BEFORE UPDATE OF department_id, linked_at`: đã có giá trị thì không đổi/xóa — `23514`; `7c28e75` không cập nhật hai cột này).
  - `departments.cost_center_id` bỏ `NOT NULL`; `departments_require_unit_cost_center()` nhận NULL.
  - Trigger `departments_cost_center_link_forward` (`AFTER INSERT ON departments`, cột cũ có giá trị): gắn Cost Center đó vào phòng mới
    (`linked_at` = `GREATEST(now(), c.created_at, d.created_at)` — lúc ghi, không bao giờ sớm hơn một trong hai dòng, F68) khi nó chưa có liên kết;
    không `RAISE` (không từ chối ghi `7c28e75`).
  - Trigger `cost_centers_department_link_backward` (`AFTER INSERT OR UPDATE OF department_id, status ON cost_centers`, Cost Center có phòng và
    `ACTIVE`): trỏ `departments.cost_center_id` của phòng đó tới Cost Center này khi đang khác (NULL hoặc Cost Center đã ngừng) — giữ bất biến
    _mọi Cost Center `ACTIVE` có phòng là cột cũ của phòng đó_, nên `7c28e75` không bao giờ thấy nó là _tự do_ để gắn cho phòng khác, và phòng
    `7c28e75` đọc luôn mang Cost Center hiện hành.
  - Bảng `cost_center_department_links` (Prisma `CostCenterDepartmentLink`, `prisma/models/organization.prisma`): `id`, `organization_id`,
    `cost_center_id` (FK `RESTRICT`, `UNIQUE`), `department_id` (FK `RESTRICT`), `basis_reference` TEXT (CHECK 2 → 200 ký tự, không trống),
    `approver_ref` TEXT, `operator_ref` TEXT, `environment` TEXT (CHECK `IN ('LOCAL_TEST', 'SHARED')`), `recorded_at` TIMESTAMPTZ(3); trigger
    chặn `UPDATE`, `DELETE`, `TRUNCATE` và từ chối `INSERT` khi Cost Center đã có `department_id` (`23514`). Giữ lâu dài làm hồ sơ căn cứ.
  - Bảng `cost_center_direction_activations` (Prisma `CostCenterDirectionActivation`): `id`, `organization_id` (FK, `UNIQUE`), `release_evidence`
    TEXT (CHECK 2 → 200), `approver_ref`, `operator_ref`, `environment` (CHECK như trên), `activated_at`; trigger chặn `UPDATE`, `DELETE`,
    `TRUNCATE`. Một dòng mỗi tổ chức, không hoàn tác. Bản cuối **giữ** bảng (image tương thích được phục hồi đọc nó) nhưng mã bản cuối không
    đọc; bỏ bảng là việc sau, khi image tương thích không còn là đích phục hồi H7 (ngoài gói).
- **Ứng dụng của bản tương thích** (Task 1.1a):
  - Mọi đọc Cost Center của phòng qua `cost_centers.department_id` (Cost Center `ACTIVE` gắn phòng); `Department.costCenterId` `@ignore`;
    `costCenter` nullable trên đọc; mọi đường suy ra Cost Center từ phòng mà không có ⟹ 409 `FINANCE.SETUP_INCOMPLETE`, 0 ghi.
  - `costCenterCreate` (Finance) theo **contract cuối**: thân `{ code, name, departmentId }`; khóa dòng phòng; phòng không có hoặc không
    `ACTIVE` trong tổ chức ⟹ 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`; phòng đã có Cost Center `ACTIVE` ⟹ 409
    `COST_CENTER.DEPARTMENT_ALREADY_LINKED` (mục K F16); thành công ghi `department_id` + `linked_at` trong **cùng** câu chèn. Kiểu
    `CostCenterRepo.insert` bắt buộc `departmentId` — không còn đường tạo Cost Center tự do (luồng _Cost Center trước, phòng sau_ của
    `7c28e75` không giữ ở API nào). Làm được trước và sau kích hoạt (trước kích hoạt chỉ phòng `7c28e75` có Cost Center đã ngừng đủ điều kiện;
    trigger ngược trỏ cột cũ nên `7c28e75` đọc được).
  - `departmentCreate` theo **contract cuối** của F10 cho thao tác này: Super Admin, `hrBasis` bắt buộc, không `costCenterId` (thân có ⟹ 422
    `VALIDATION_ERROR`); tổ chức **chưa** có dòng kích hoạt ⟹ 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION`, 0 ghi; đã có ⟹ 201, phòng không
    Cost Center (`costCenter: null`). Các ghi tổ chức còn lại của F10 ở Task 2.2.
  - Checklist khởi tạo bỏ `NO_FREE_COST_CENTER` (mời tạo Cost Center tự do); bước tạo phòng báo `AWAITING_ACTIVATION` khi chưa kích hoạt.
  - Lệnh cài đặt của bản tương thích ghi phòng **trước**, rồi Cost Center có `departmentId` (ngoại lệ cài đặt `QĐ-67a` giữ tới F09 ở Task 2.1);
    `dev:seed` cùng thứ tự và ghi dòng kích hoạt `LOCAL_TEST` (CSDL local mới không có đích phục hồi `7c28e75`).
- **Lệnh thủ tục — một lệnh của capability `organization`:** `pnpm ops:cost-center-direction <activate|link> [options]` — script
  `"ops:cost-center-direction": "node dist/cost-center-direction-cli"`, entry `src/cost-center-direction-cli.ts`, module lệnh
  `src/cost-center-direction-cli.module.ts`, capability `src/modules/organization/cost-center-direction/` (`cost-center-direction.arguments.ts`,
  `.service.ts`, `.policy.ts`, `.repo.ts`, `.errors.ts`, `.types.ts`); đăng ký ở `COMMAND_ENTRIES`/`COMMAND_ONLY_FILES` của
  `src/operational-commands.spec.ts`, `src/module-graph.spec.ts` và bảng _Hợp đồng lệnh hiện có_ của `docs/rules/operational-commands.md`; không
  tới được từ `AppModule`/`WorkerModule`; chạy như `ops:assign-subscription-owner` (vai runtime). Không thao tác sẵn có nào làm đúng việc này:
  `costCenterCreate` tạo Cost Center **mới**, `departmentCreate` của `7c28e75` dựng phòng **quanh** Cost Center có sẵn (ngược chiều `QĐ-87d`),
  `ops:assign-subscription-owner` chỉ ghi phòng sở hữu thuê bao.
  - **Tham số chung bắt buộc:** `--approved-by <tham chiếu phê duyệt bằng văn bản>`, `--operator <tham chiếu người chạy>`, `--environment
LOCAL_TEST|SHARED`; tùy chọn tên `password`, `pass`, `pwd`, `secret`, `token`, `code` bị từ chối theo tên trước khi nạp môi trường (như
    `ops:recover`). **Tách người** (`cost-center-direction.policy.ts`, trước giao dịch ghi): ở `SHARED` người chạy khác người phê duyệt
    (`APPROVER_IS_OPERATOR`); `LOCAL_TEST` cho một người; Audit ghi môi trường.
  - **Probe schema trước mọi truy vấn:** `information_schema.columns` (`cost_centers.department_id`) và `to_regclass` của hai bảng mới; thiếu
    ⟹ exit 1 `SCHEMA_NOT_READY`, không ghi.
  - **`activate --release-evidence <lượt deploy H7 + SHA image tương thích>`** — chạy **chỉ** sau khi H7 báo bản tương thích sẵn sàng
    (`releases/current-image` = image tương thích) và tracker ghi SHA đó; người phê duyệt là Owner/người phụ trách release. Một giao dịch: dòng
    kích hoạt của tổ chức → Audit `OPERATOR` `COST_CENTER_DIRECTION.ACTIVATED` (`operatorReference` = bằng chứng; `after` `{ releaseEvidence,
approver, operator, environment }`). Đã kích hoạt ⟹ exit 2, không ghi; bằng chứng 2 → 200 ký tự (`RELEASE_EVIDENCE_INVALID`). Lệnh không
    đọc được trạng thái host: _H7 đã báo sẵn sàng_ là việc operator xác nhận, bằng chứng ghi vào Audit và tracker (cùng loại với _bản cuối chỉ
    deploy khi bản đang chạy là bản mở rộng_ của L.3).
  - **`link --cost-center <UUID> --department <mã phòng> --basis <tham chiếu căn cứ có thẩm quyền>`** — người phê duyệt là **Finance**
    (`QĐ-87d`(1)); một Cost Center mỗi lần, không tùy chọn hàng loạt, không phòng mặc định, không khớp theo tên/mã. Một giao dịch, khóa dòng
    phòng rồi dòng Cost Center (`FOR UPDATE`), kiểm dưới khóa: Cost Center có trong tổ chức (`COST_CENTER_NOT_FOUND`); còn `department_id` NULL
    — đã gắn đúng phòng đó ⟹ exit 2, phòng khác ⟹ `COST_CENTER_ALREADY_LINKED`; phòng có trong tổ chức (`DEPARTMENT_NOT_FOUND`); Cost Center
    `ACTIVE` ⟹ phòng `ACTIVE` (`DEPARTMENT_NOT_ACTIVE`) và chưa có Cost Center `ACTIVE` (`DEPARTMENT_ALREADY_HAS_ACTIVE_COST_CENTER` — Finance
    ngừng một trong hai bằng `costCenterDeactivate` trước, theo quyết định của chính Finance; lệnh không tự ngừng); Cost Center `INACTIVE` ⟹ phòng
    nào có trong tổ chức cũng được (lịch sử); có dòng tham chiếu Cost Center mà phòng khác phòng đích (`access_requests.department_id`,
    `license_assignments.owning_department_id`) hoặc dòng `budget_proposals`/`budget_versions`/`budget_commitments` ⟹
    `COST_CENTER_REFERENCES_CONFLICT`; căn cứ 2 → 200 ký tự (`BASIS_INVALID`). Ghi: dòng `cost_center_department_links` → `department_id` và
    `linked_at` (Cost Center `ACTIVE`: `GREATEST(now(), c.created_at, d.created_at)` — hiện hành từ lúc ghi, không hồi tố, `QĐ-87d`(3); `INACTIVE`:
    `GREATEST(deactivated_at, c.created_at, d.created_at)`, khoảng hiện hành rỗng; F68: mốc liên kết không bao giờ sớm hơn Cost Center hay phòng) → trigger ngược trỏ cột cũ khi `ACTIVE` → Audit `OPERATOR` `COST_CENTER.DEPARTMENT_LINKED_BY_PROCEDURE` (`before` `{ departmentId:
null, linkedAt: null }`, `after` `{ departmentId, linkedAt, linkId, basis, approver, operator, environment }`).
  - **Không có phòng hợp lệ** cho một Cost Center: Super Admin tạo phòng thật qua `departmentCreate` (sau kích hoạt, kèm `hrBasis`) rồi Finance
    phê duyệt `link`; tới khi đó bản cuối vẫn `BLOCKED`. Không suy diễn phòng, không mặc định hàng loạt, không tự ngừng/xóa Cost Center, không
    sửa lịch sử migration, không chạy câu SQL trực tiếp trên CSDL.
  - **Đầu ra:** chỉ `mode`, `costCenter` hoặc `organization`, `department` (UUID), `outcome`; không tên, mã, căn cứ, người phê duyệt hay người
    chạy. Từ chối in `Refused (<PROBLEM>). Nothing was changed.` **Mã thoát:** 0 đã ghi · 2 không cần làm · 1 bị từ chối hoặc lỗi, không ghi
    gì.
- **Kiểm kê sống** (`ops:preflight` của bản tương thích và bản cuối; probe schema trước, tính lại mỗi lần chạy, chỉ ID):
  - Chưa có migration của bản tương thích ⟹ bản tương thích `READY` kèm thông tin `COST_CENTER_TO_LINK { costCenterId }` (Cost Center không phòng
    nào trỏ tới — chỉ đọc cột cũ); bản cuối `BLOCKED` `COST_CENTER_DIRECTION_EXPANSION_REQUIRED { organizationId }` khi đã có tổ chức (CSDL
    trống ⟹ `READY`).
  - Đã có: `BLOCKED` `COST_CENTER_UNLINKED { costCenterId }` cho **mọi** `department_id IS NULL` — gồm Cost Center tự do cũ và dòng `7c28e75` tạo
    **sau** migration của bản tương thích (cửa sổ deploy) hay **sau** khi H7 phục hồi/rollback có chủ đích; `BLOCKED` `COST_CENTER_LINK_MISMATCH {
costCenterId, departmentId }` khi cột cũ của phòng trỏ tới Cost Center có `department_id` khác (mong đợi 0 nhờ trigger — lưới an toàn, không tự
    sửa); `COST_CENTER_DIRECTION_NOT_ACTIVATED { organizationId }` — thông tin ở bản tương thích, `BLOCKED` ở bản cuối. Như L.3, `BLOCKED` chặn mọi
    deploy tiếp (kể cả lại bản tương thích) tới khi đóng.
- **Migration thu hẹp** `…_cost_center_belongs_to_department` (Task 1.1, sau (B)): khối `DO $$` **trước mọi ghi** — còn Cost Center có
  `department_id` hoặc `linked_at` NULL, còn lệch cột cũ/liên kết, hoặc tổ chức chưa có dòng kích hoạt ⟹ `RAISE EXCEPTION` chỉ liệt kê ID (lưới
  an toàn; preflight đã phải `BLOCKED`); đủ ⟹ `SET NOT NULL` cho `department_id` và `linked_at`, bỏ CHECK `cost_centers_link_together` (thừa),
  giữ `cost_centers_one_active_per_department` và `cost_centers_department_link_once`, rồi mới bỏ hai trigger đồng bộ,
  `departments_unit_cost_center` và hàm, cột `departments.cost_center_id`; viết lại guard tài khoản dịch vụ đọc liên kết mới. Không chép hay suy
  liên kết nào trong migration.
- **Hai cửa sổ sau sửa:**
  - Cửa sổ 1: trước kích hoạt image tương thích chỉ ghi Cost Center **có** phòng cho phòng `7c28e75` (trigger ngược trỏ cột cũ) — `7c28e75` được
    phục hồi đọc danh sách/chi tiết phòng, danh mục Cost Center, tra cứu import 2xx, không dòng nào biến mất; `departmentCreate` 409 nên không có
    phòng thiếu Cost Center. Rollback có chủ đích về `7c28e75` hợp lệ **tới trước** kích hoạt (ca chuyển phòng chờ sót của L.5 xảy ra trước kích
    hoạt vì preflight của bản tương thích chặn deploy thành công khi còn dòng chờ); sau kích hoạt là đường khẩn cấp (`pg_dump`, bất biến 4 của
    L.10).
  - Cửa sổ 2: trên schema sau migration thu hẹp, image tương thích được phục hồi tạo phòng không Cost Center (đã kích hoạt — cổng preflight và
    `RAISE` bảo đảm), tạo Cost Center có `departmentId` (thỏa `NOT NULL`), trả 409 khi phòng đã có Cost Center `ACTIVE`, đọc qua liên kết mới; mã
    của nó không nhắc `departments.cost_center_id` (gate tĩnh) và không có đường chèn Cost Center thiếu phòng ⟹ không `23502`, không 500.
- **Trình tự Owner/operator** (Task 1.2b; thay phần F01 của _Thứ tự deploy_ ở L.10): trên `7c28e75` hủy chuyển phòng chờ (L.5) → commit, push, CI,
  deploy bản tương thích (lỗi ⟹ `7c28e75` chạy tiếp, dòng nó tạo vào kiểm kê) → **sau khi H7 báo sẵn sàng**, ghi SHA image rồi `pnpm
ops:cost-center-direction activate` → với mỗi `COST_CENTER_UNLINKED`: Finance xác định phòng từ căn cứ có thẩm quyền (chưa có phòng ⟹ Super
  Admin tạo phòng thật trước) → `link` → gán thuê bao (L.3), dọn L.4, ca J.2 → `ops:preflight` `READY` (mọi cổng, gồm ba mã F01) trong khi bản
  tương thích đang chạy → tracker.
- **Chứng minh** (test matrix Phase 1 các dòng F01, diễn tập bước 2 → 8; Prompt 04 § 1A, § 3 bước 5): Cost Center tự do muộn của runtime
  `7c28e75` thật vào kiểm kê; ghi của image ứng viên trước một lượt deploy tương thích lỗi được `7c28e75` đọc lại; `activate`/`link` theo hợp
  đồng trên (một phần, phòng sai/thiếu, thử suy diễn, chạy lại, đua có barrier); preflight `BLOCKED` chỉ ID và 0 ghi; migration thu hẹp `RAISE` 0
  ghi rồi NOT NULL; đọc/ghi F01 của image tương thích sau **mỗi** migration bản cuối và sau phục hồi H7; CSDL trống; đối chứng gài lỗi (cột cuối
  nullable, Cost Center tự do ở bản cuối, bỏ dòng muộn khỏi kiểm kê, suy diễn phòng, phục hồi chỉ kiểm health) đều đỏ.
- **Giới hạn còn lại (thật):** trước kích hoạt không tạo được phòng (409 có biên, Owner chấp nhận); kích hoạt không hoàn tác — sau đó rollback về
  `7c28e75` là đường khẩn cấp; `activate` không tự kiểm được trạng thái host (operator xác nhận, bằng chứng ở Audit và tracker); bảng kích hoạt ở
  lại bản cuối tới khi image tương thích hết là đích phục hồi.

#### L.12 Đích quay về phải đọc được dữ liệu (`P04-CPE-04`, Prompt 04 mục 9.10, 28/10/2026)

- **Vì sao:** F91 (`QĐ-87g(2)`) cho bản cuối ghi Request nội bộ không phí **đã trình** với `cost_center_id` NULL; image tương thích
  `fba4dfe` (bất biến) khai `costCenterId String` và đọc mọi Request không phải `DRAFT` ⟹ đọc dòng đó lỗi (impact matrix 3.11). Bất biến 2
  và 4 của L.10 (_bản tương thích đọc được mọi dòng bản cuối có thể ghi trong cửa sổ sẵn sàng_; _phục hồi không cần CSDL_) **không còn đúng
  vô điều kiện**. Readiness chỉ ping CSDL nên không chứng minh gì. Đếm dòng NULL lúc preflight cũng không đủ: một dòng ghi sau đó (trong
  cửa sổ sẵn sàng, hay nhiều ngày sau khi bản cuối phục vụ) làm kết quả đếm sai.
- **Chính sách** (nhỏ nhất, trong ranh giới đã duyệt — không thêm revision, điểm dừng, cờ hay migration):
  1. **Dạng dữ liệu** = hình dạng dòng mã này ghi mà runtime trước không đọc được; danh mục `DATA_REPRESENTATIONS` ở
     `src/modules/installation/migration-preflight/recovery-target.ts`; hiện có **một**: `access-request-null-cost-center` (Request không
     `DRAFT` có `cost_center_id` NULL). Nháp không tính: không runtime nào đọc nháp nó không ghi — tại `fba4dfe` mọi đường đọc Request lọc
     `DRAFT` (`access-request.repo.ts:276`, `open-request.repo.ts:37`, `request-status.repo.ts:15`, `request-timing.repo.ts:21`). Đã rà các
     migration bản cuối sau `fba4dfe`: `close_reason = 'BENEFICIARY_TRANSFERRED'` (`…101000`) là TEXT mà `fba4dfe` đọc như chuỗi tự do,
     `AccessRequestCancelCause.BENEFICIARY_TRANSFERRED` và `DRAFT` có sẵn trong enum của `fba4dfe` ⟹ không phải dạng mới.
  2. **Khai báo:** image khai các dạng runtime của nó đọc ở nhãn `io.github.baophipham.slm.data-reads` (Dockerfile, stage `runtime` — chỉ nhãn
     của stage cuối tới image; `recovery-target.spec.ts` ghim nhãn = danh mục). Image dựng trước nhãn (`fba4dfe`, `7c28e75`, …) khai không gì.
     Nguồn: Docker — _"Labels included in base images … are inherited"_, nhãn stage khác chỉ tới image cuối khi stage cuối dựa trên nó
     (<https://docs.docker.com/reference/dockerfile/#label>); đọc bằng `docker image inspect --format='{{json .Config.Labels}}'` (cùng trang);
     khóa chữ thường, số, `.`, `-`, tiền tố DNS ngược (<https://docs.docker.com/engine/manage-resources/labels/>).
  3. **Phán định** `pnpm ops:preflight --recovery-target <nhãn JSON>` (cùng graph chỉ đọc của preflight, deploy role; repository thêm một câu
     probe và hai câu đếm `SELECT`): `COMPATIBLE` (exit 0) khi mọi dạng có dòng đều được khai; `INCOMPATIBLE` (2); `NO_HISTORY` (3) khi CSDL
     chưa từng có migration hoàn tất — không release nào chạy trên nó nên không image nào là đường quay về; lỗi/nhãn không đọc được 1. Chỉ
     in tên dạng và số dòng.
  4. **Deploy H7** (`scripts/ops/deploy-release.sh`): (a) **trước `migrate deploy`** phán định image trước (nếu có): không đọc được nhãn
     (image không có trên host) ⟹ dừng exit 1, chưa migrate (điều kiện operator: `docker pull`); `NO_HISTORY` trong khi host vẫn ghi một release
     ⟹ dừng exit 1 (cài mới trên CSDL đã làm trống: dời trạng thái release cũ sang chỗ lưu — runbook); `INCOMPATIBLE` ⟹ chỉ cảnh báo, deploy
     tiếp (bản sửa tiến là lối ra); (b) **khi phục hồi** mà container ứng viên đã được tạo: **dừng `api`/`worker` của ứng viên trước** (không
     ghi thêm), rồi phán định lại trên CSDL như nó đang là; chỉ `COMPATIBLE` mới dựng lại image trước; mọi kết quả khác — có dòng không đọc
     được, không dừng được ứng viên, image không còn trên host, phán định lỗi — ⟹ `RECOVERY: REFUSED`, không dựng lại, exit 1, tệp trạng thái
     release về release trước, `api`/`worker` dừng: gián đoạn được nêu rõ, không phải phục hồi thành công, không marker, không `latest`.
  5. **Rollback tay** (runbook _Roll back a ready release_ bước 0): giữ khóa host, dừng `api`/`worker`, phán định bằng image đang chạy (đọc
     được dòng của chính nó); `INCOMPATIBLE` ⟹ không rollback, khởi động lại, sửa tiến. Không rollback bằng cách deploy commit cũ: script của
     commit cũ không có phán định.
  6. **Cài mới:** không có release trước ⟹ không đường quay về; lỗi ⟹ `RECOVERY: not possible`, không marker, không `latest`; không chọn
     image cũ chỉ vì tệp release cũ còn trên host (4a, `NO_HISTORY`).
- **Đích quay về được hỗ trợ theo pha:**

| Deploy                         | Đích quay về                                                         | Điều kiện                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7c28e75` → bản tương thích    | `7c28e75`                                                            | như L.10/L.11 (tới trước bước kích hoạt); script `fba4dfe` chưa có phán định — bản tương thích không ghi dạng mới nào                                                                          |
| bản tương thích → bản cuối     | `fba4dfe`                                                            | `--recovery-target` = `COMPATIBLE` lúc phán định (ứng viên đã dừng); bản cuối đã ghi `access-request-null-cost-center` ⟹ **không có** (sửa tiến, hoặc khôi phục dump theo quyết định operator) |
| bản cuối → bản sau             | bản cuối (khai `access-request-null-cost-center`) hoặc image khai đủ | như trên                                                                                                                                                                                       |
| cài mới (CSDL chưa có lịch sử) | không có                                                             | lỗi sau promote = cài đặt lỗi                                                                                                                                                                  |

- **Không làm:** sửa `fba4dfe` hay migration đã có, đổi NULL thành ID giả, Cost Center giữ chỗ, xóa/cắt bảng, sửa lịch sử, `db push`, cờ hạ
  cấp, tắt phục hồi H7.
- **Giới hạn còn lại (thật):** (a) phục hồi bị từ chối = gián đoạn tới khi có bản sửa tiến (hoặc khôi phục dump — mất mọi ghi sau dump);
  (b) deploy bằng script của commit cũ (workflow chạy ở commit cũ) không có phán định — runbook cấm dùng để rollback; (c) chỉ kiểm bằng unit và
  script với Docker giả; chưa chạy trên Docker/PostgreSQL thật (`deferred-by-owner-test-policy`): **không** được ghi `P04-CPE-04` đã kiểm vận
  hành; (d) một dạng dữ liệu mới về sau phải thêm vào cả danh mục lẫn nhãn trong cùng thay đổi (spec test ghim); (e) lỗi duy nhất **sau**
  readiness là đổi tên `releases/current-attempt`: khi đó phục hồi bị từ chối dừng một bản đã khỏe (runbook: sửa nguyên nhân, deploy lại
  cùng bản với `--attempt` mới); (f) phán định chỉ đếm được các dạng mà image ứng viên biết — rollback tay về release cũ hơn dùng image đang
  chạy để phán định (runbook bước 0). Phán định chạy tối đa ba lần, mỗi lần ≤ 120 s; dừng ứng viên ≤ 120 s.
- **Owner đã chọn A ngày 28/10/2026 (`OD-CPE-04`, đã đóng):** chấp nhận chính sách trên, gồm hệ quả (a): từ chối phục hồi về image không
  đọc được dữ liệu mới; deploy thất bại có thể khiến API tạm ngưng tới khi có bản sửa tiến. Chấp thuận này không phải bằng chứng Docker/DB
  thật đã chạy, không hoàn tất action 9 và không cho phép tự deploy/xóa DB. Không hỏi lại A/B. Phương án thay thế — cờ hoãn ghi NULL —
  không được chọn và không được hiện thực. `P04-CPE-04` giữ `mitigated-locally`, kiểm vận hành vẫn `deferred-by-owner-test-policy`.

## Test matrix

Ma trận đầy đủ theo phase ở [test-matrix.md](test-matrix.md); tóm tắt rủi ro chính:

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                                                   | Cấp test                     | Kết quả mong đợi                                                                                                                                                                                                    | Bằng chứng sau implement |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| F01 migration và liên kết    | CSDL có dữ liệu ở `7c28e75` (cặp cũ, Cost Center tự do, Cost Center tự do muộn của `7c28e75`) → bản tương thích → kích hoạt → `link` từng ID → bản cuối                                                                                                                               | migration, integration       | cặp 1–1 giữ nguyên; preflight `BLOCKED` chỉ ID tới khi liên kết xong; bản cuối `department_id`/`linked_at` NOT NULL; không đường tạo Cost Center thiếu phòng; phòng mới tạo được không Cost Center                  | planned                  |
| F10, F40 actor               | Super Admin ghi kèm căn cứ; IT Admin ghi; thiếu căn cứ; Super Admin về chính mình                                                                                                                                                                                                     | e2e + integration            | 2xx / 403 / 422 / 403                                                                                                                                                                                               | planned                  |
| F27 cổng tài chính           | Request trả phí, nhóm, tài khoản dịch vụ, `BM-10`, phiên bản khi phòng chưa có Cost Center                                                                                                                                                                                            | integration                  | 409 trước kiểm tra ngân sách; nháp lưu được; nội bộ đi qua                                                                                                                                                          | planned                  |
| F28, F29 điều chuyển         | Request trả phí đang chờ nhu cầu khi điều chuyển; Request nội bộ; tác vụ cấp đã có quyền                                                                                                                                                                                              | integration                  | trả phí giữ phòng; nội bộ đổi người; đã cấp không bị _đã hủy_                                                                                                                                                       | planned                  |
| F31 đua ngân sách            | hai Request khác nhau cùng Cost Center/năm duyệt đồng thời (barrier)                                                                                                                                                                                                                  | integration                  | một `BUDGET_OK`, một bị tính lại thành ngoại lệ                                                                                                                                                                     | planned                  |
| F42, F43 rà soát             | người chỉ có quyền nội bộ; `STILL_NEEDED` rồi Request mới hoàn tất                                                                                                                                                                                                                    | integration                  | rà soát mở; seat cũ thu hồi sau cấp mới                                                                                                                                                                             | planned                  |
| F04, F05, F06, F03 gỡ        | operation bị gỡ → 404; Request không còn đòi lý do ngoài bộ chuẩn                                                                                                                                                                                                                     | e2e                          | không còn trong OpenAPI; 2xx                                                                                                                                                                                        | planned                  |
| F62 đóng cuối năm            | năm kết thúc với bản hiện hành, bản nháp, bản chờ quyết định, đề xuất chưa dùng; chạy lại; quyết định đua với việc đóng (barrier)                                                                                                                                                     | integration                  | hết hiệu lực đúng cờ; không đổi khi chạy lại; quyết định sau ngày kết thúc 422 `BUDGET.YEAR_ENDED`                                                                                                                  | planned                  |
| F63, F64 phiên bản tiếp theo | từ chối → lập lại từ cùng đề xuất; đề xuất kế tiếp sau từ chối (ràng buộc CSDL, đua có barrier); đối soát dòng `RETURNED` cũ R1/R2/A; phòng chưa có trưởng phòng tạo bản sửa đổi                                                                                                      | integration, migration       | đề xuất giữ `REVIEWED`; `rejected_predecessor_id`, `successor_of_proposal_id` đúng; ca mơ hồ chặn, 0 ghi dở; sửa đổi bị từ chối 409 `BUDGET.DEPARTMENT_HAS_NO_HEAD`                                                 | planned                  |
| F65 Request chờ phiên bản    | phiên bản bị từ chối/hết hiệu lực khi Request đang chờ; `financeReviewComplete` trên Request `AWAITING_BUDGET` mỗi kết cục, quyền, `SoD-8`, lặp, đua (barrier)                                                                                                                        | integration, e2e             | Request giữ chờ, Finance được báo; (i)/(iii) được, `NEEDS_BUDGET` 409; mỗi mã một status; không bản ghi thứ hai                                                                                                     | planned                  |
| F66 lịch sử sửa              | sửa số/dòng/nhập/dời khoảng; `budgetVersionHistoryList` theo vai, trang, thứ tự; giao dịch lỗi giữa chừng                                                                                                                                                                             | integration, e2e             | Audit và lịch sử trước/sau thật; 403 ngoài Finance/người quyết; không ghi dở; không lộ dữ liệu khác                                                                                                                 | planned                  |
| F67 thông báo                | các dòng 18, 40, 41, 47, 48, 52 → 55; dòng 53 phòng chưa có trưởng phòng                                                                                                                                                                                                              | integration                  | đúng người nhận, cùng giao dịch; giữ chờ tới trưởng phòng đầu tiên                                                                                                                                                  | planned                  |
| F19 thủ tục Super Admin      | `ops:record-super-admin-event` mỗi mode; tách người; phiếu lặp, khác tham số; đầu ra; người giữ vai đã rời rồi `ops:recover transfer-role`                                                                                                                                            | unit, integration, gate      | sự kiện có Audit `OPERATOR`; từ chối không ghi gì; exit 0/2/1; vai, mật khẩu, phiên không đổi                                                                                                                       | planned                  |
| F02 mở rộng → gán → thu hẹp  | (A) với runtime `7c28e75` (cửa sổ deploy, phục hồi image cũ); bản mở rộng chạy; kiểm kê sống (gán thiếu, dòng muộn, dòng sau rollback); (B) chỉ sau `READY`; rollback bản cuối về bản mở rộng; probe trước (A); CSDL trống                                                            | migration, integration       | runtime cũ tạo/sửa/đọc được sau (A); 0 migration lỗi, lịch sử sạch; `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED` chặn trước migration; NOT NULL; runtime mở rộng hợp lệ trên (A) + (B)                                   | planned                  |
| Ranh giới `P03-RV-03`        | image tương thích thật qua từng migration của bản cuối; đối tượng sắp xóa không được dùng; lỗi giả lập sau `migrate deploy`/`reconcile`/promote/kiểm sẵn sàng; F20 trước/sau trigger; đồng thuận schema; tạo phòng không Cost Center và Cost Center cho phòng trên schema cuối (L.11) | migration, integration, gate | đọc/ghi nghiệp vụ 2xx hoặc 4xx đã ánh xạ, 0 phản hồi 500; H7 phục hồi không khôi phục CSDL; 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`, 0 ghi; khác biệt schema chỉ là đối tượng thêm/xóa đã liệt kê | planned                  |
| F03, F41 dữ liệu chức vụ     | chép chức vụ hiện hành và lịch sử; dòng chờ của loại đã bỏ                                                                                                                                                                                                                            | migration, integration       | không tên bịa/mất; `ops:preflight` `BLOCKED` khi còn dòng chờ                                                                                                                                                       | planned                  |
| F04 → F06 bản sao lưu        | `pg_dump` trước khi bỏ bảng; dòng chuyển phòng chờ                                                                                                                                                                                                                                    | migration, gate              | không tệp sao lưu trong Git/artifact; bằng chứng chỉ checksum + vị trí được bảo vệ                                                                                                                                  | planned                  |

## Owner dispositions

Mỗi mục có phương án loại trừ nhau và khuyến nghị. **Owner trả lời ngày 27/10/2026: chín mục chặn = A** (cột _Trạng thái_); hệ quả
hiện thực ở [mục L](#l-hệ-quả-của-disposition-owner-27102026). Không còn mục _chặn_; Prompt 04 không hỏi lại. Mục không chặn dùng mặc định A (L.9).

| Mã      | Trạng thái                          | Câu hỏi                                                                                  | A (khuyến nghị; chọn cho mọi mục đã trả lời)                                                                                                                                                                                                                                                                                                          | B (phương án còn lại)                                                          | Finding             |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| P03-D01 | **Đã trả lời A** (Owner 27/10/2026) | Biểu diễn nháp Request trả phí khi phòng chưa có Cost Center (T-1)                       | Trạng thái `DRAFT` của chính Request; Cost Center nullable chỉ khi `DRAFT`; trình chạy lại mọi cổng → hệ quả: [mục L.1](#l1-nháp-request-trả-phí-p03-d01-f27)                                                                                                                                                                                         | Bảng nháp riêng, Request chỉ tạo khi trình                                     | F27                 |
| P03-D02 | **Đã trả lời A** (Owner 27/10/2026) | Kênh thủ tục có kiểm soát khi Super Admin duy nhất là đối tượng (T-2)                    | Lệnh ngoài HTTP (`pnpm ops:record-super-admin-event` — tên chốt 27/10/2026) có phiếu phê duyệt văn bản, người chạy khác người giữ vai, Audit; không đổi vai/mật khẩu, không phải `REASSIGN` → hệ quả: [mục L.2](#l2-thủ-tục-có-kiểm-soát-khi-super-admin-là-đối-tượng-p03-d02-f19)                                                                    | Hoãn: giữ từ chối trong ứng dụng, ghi giới hạn đã biết; không code ở Prompt 04 | F19                 |
| P03-D03 | **Đã trả lời A** (Owner 27/10/2026) | Điền phòng sở hữu cho thuê bao đã có (`QĐ-89e`, không suy diễn)                          | Hai bước: cột nullable + lệnh vận hành gán theo căn cứ mua/hợp đồng (preflight liệt kê thiếu); migration NOT NULL dừng có danh sách nếu còn thiếu → hệ quả: [mục L.3](#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02)                                                                                                                                | Dữ liệu chỉ ở dev/demo: xóa và seed lại thuê bao; không lệnh gán               | F02                 |
| P03-D04 | **Đã trả lời A** (Owner 27/10/2026) | Giá trị chức vụ khi gỡ danh mục                                                          | Chép tên chức vụ của giai đoạn hiện hành vào `employees.job_title`; giữ tên ở giai đoạn cũ thành cột chữ chỉ đọc (lịch sử, không API) → hệ quả: [mục L.4](#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41)                                                                                                                              | Chép giai đoạn hiện hành; bỏ lịch sử sau khi xuất bản sao CSDL                 | F03                 |
| P03-D05 | **Đã trả lời A** (Owner 27/10/2026) | Dữ liệu cũ của _đổi chức vụ_ (điều chuyển chỉ đổi chức vụ, thông báo `JOB_TITLE_CHANGE`) | Giữ dòng làm lịch sử, giá trị enum thành _chỉ đọc_ (CHECK cấm dòng mới); hủy dòng đang chờ với lý do _loại đã bỏ (`QĐ-87e`, `D-1`)_ → hệ quả: [mục L.4](#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41)                                                                                                                                | Hủy/xóa dòng rồi dựng lại enum bỏ giá trị (không hoàn tác)                     | F41                 |
| P03-D06 | **Đã trả lời A** (Owner 27/10/2026) | Dữ liệu bộ chuẩn, phân bổ tỷ lệ, chuyển phòng tài khoản dịch vụ                          | Xuất `pg_dump` (lưu cùng bằng chứng release) rồi bỏ bảng/cột; hủy dòng chuyển phòng đang chờ có lý do trước khi bỏ → hệ quả: [mục L.5](#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06)                                                                                                                     | Giữ bảng chỉ đọc (thu hồi DML của vai runtime), chỉ gỡ API                     | F04–F06             |
| P03-D07 | **Đã trả lời A** (Owner 27/10/2026) | Thay đổi phá vỡ contract (gỡ 17 operation, bỏ/đổi trường)                                | Gỡ trực tiếp một lượt, không cửa sổ deprecation (FE/Mobile chưa nối API); ghi bàn giao → hệ quả: [mục L.6](#l6-thay-đổi-phá-vỡ-contract-p03-d07)                                                                                                                                                                                                      | Giữ operation bị gỡ trả 410 trong một release                                  | F03–F06             |
| P03-D08 | **Đóng**                            | Kết cục _cần sửa ngân sách_ cho `INSUFFICIENT_BUDGET`                                    | **Đóng 26/10/2026 theo nguồn pin cuối, không cần Owner chọn:** BRD v3.57 `FR-3.20` (dòng `INSUFFICIENT_BUDGET` liệt kê kết cục này), `QĐ-92d`(2), `US-06-13` AC-13 cùng nói một đáp án = nội dung phương án A; không còn câu Story nào giới hạn _chỉ `NO_ACTIVE_BUDGET`_ ⟹ không cần chat Docs sửa                                                    | —                                                                              | F33                 |
| P03-D09 | **Đã trả lời A** (Owner 27/10/2026) | PATCH thuê bao tăng số lượng/kéo dài kỳ khi phòng sở hữu chưa có Cost Center             | Chặn (tạo/tăng/kéo dài nghĩa vụ — `QĐ-88a`(2)); sửa dữ liệu không tăng/kéo dài vẫn được → hệ quả: [mục L.7](#l7-patch-thuê-bao-khi-phòng-chưa-có-cost-center-p03-d09-f26)                                                                                                                                                                             | Không chặn (IT ghi nhận khoản đã ký)                                           | F26                 |
| P03-D10 | Không chặn — mặc định A (L.9)       | Kỳ hủy được là dự báo (`QĐ-84a`(4))                                                      | Hoãn tới G8; giữ hành vi, ghi giới hạn                                                                                                                                                                                                                                                                                                                | Thêm _số tháng cam kết_ vào bằng chứng giá, phần sau là dự báo                 | F35                 |
| P03-D11 | **Đã trả lời A** (Owner 27/10/2026) | Nguồn giá của Request                                                                    | Thuê bao đang hoạt động của **phòng Request** nếu có; không thì giá gói/báo giá (`BM-02`); không lấy thuê bao phòng khác → hệ quả: [mục L.8](#l8-nguồn-giá-của-request-p03-d11-f38)                                                                                                                                                                   | Giữ giá thuê bao mới nhất của gói ở mọi phòng                                  | F38                 |
| P03-D12 | Không chặn — mặc định A (L.9)       | Sweeper trong tiến trình API                                                             | Giữ cho MVP (một instance API), ghi ADR và sửa tài liệu                                                                                                                                                                                                                                                                                               | Chuyển mọi sweeper sang worker trong Prompt 04                                 | F53                 |
| P03-D13 | Không chặn — mặc định A (L.9)       | Allowlist nội module G5/G6                                                               | Chấp nhận, đóng băng (Prompt 04 không thêm mục), refactor giữ hành vi sau                                                                                                                                                                                                                                                                             | Refactor trong Prompt 04                                                       | F54                 |
| P03-D14 | Không chặn — mặc định A (L.9)       | `LD-13`, gate POST, định dạng ngày/tiền                                                  | Ngoài Prompt 04 (có từ trước `QĐ-87`); chỉ xóa mục registry của operation bị gỡ                                                                                                                                                                                                                                                                       | Gộp vào Prompt 04                                                              | F55, F56            |
| P03-D15 | Không chặn — mặc định A (L.9)       | Phạm vi thông báo                                                                        | Chỉ thông báo của `QĐ-87b`(3), `D-7`, `US-02-02` AC-17 và thông báo Super Admin khi IT Admin tự thực thi; còn lại ở `g4-notification-delivery`                                                                                                                                                                                                        | Mọi cảnh báo license `FR-5.14` của G0–G6                                       | F17, F24, F58       |
| P03-D16 | **Đã trả lời**                      | `QĐ-91` (vòng đời phiên bản ngân sách) chưa commit trên Docs sau pin `769bb64`           | **Owner chọn A ngày 26/10/2026:** Docs commit tới `e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` (`QĐ-91`, `QĐ-92`, BRD v3.57, 1 560 AC, `BEH-14`, Logical 3.3) và pin SHA đó; delta audit **trong cùng hạng mục** (impact matrix mục 3.8, F62 → F67) — không phải Prompt 04 Phase 0 như phương án ghi ban đầu, vì Owner yêu cầu làm ngay trong Prompt 03 | Prompt 04 chỉ làm baseline `769bb64`; `QĐ-91` thành hạng mục sau               | F33, F36, F62 → F67 |

**Ghi chú phạm vi P03-D15 (26/10/2026):** P03-D15 chỉ là lựa chọn phạm vi cho cảnh báo license/`FR-5.14` ngoài vòng ngân sách (F58). Thông
báo vòng ngân sách và vòng Finance–trưởng phòng (F67: dòng 18, 40, 41, 47, 48, 52 → 55) do `QĐ-92b` và AC (`US-06-10` AC-11/12, `US-06-11`
AC-3/10, `US-06-13` AC-9/11, `US-12-15` AC-24) xác định — trong phạm vi Prompt 04 bất kể P03-D15.

**Đánh giá lại theo nguồn cuối `e0cb5a0` (26/10/2026):** P03-D01 → P03-D07, P03-D09, P03-D11 không bị delta chạm (delta chỉ đổi ngân sách
năm, Request chờ phiên bản, thông báo) — lúc đó vẫn cần Owner; Owner trả lời A ngày 27/10/2026 (mục L). P03-D10, P03-D12, P03-D13, P03-D14 không đổi. P03-D07 phủ cả thay đổi wire của delta
(enum cộng thêm, trường chỉ đọc, đổi hành vi `budgetVersionDecide` — impact matrix mục 6): không có câu hỏi mới. Delta **không** sinh câu
hỏi Owner mới: tên trạng thái/cờ, cách lưu lịch sử, thông báo giữ chờ, cách chặn là thiết kế BE theo `T-10`/`T-11` và nay đã chốt ở mục J;
cách sửa F36 là cách duy nhất ở trong tập trạng thái `QĐ-91a`. _(Sửa 26/10/2026: câu cũ "dữ liệu cũ của F63 chỉ ở dev/demo và giữ làm lịch
sử" bị thay — dòng `RETURNED` cũ được đối soát tất định theo J.2; chỉ ca mơ hồ cần Owner/operator xử lý theo **ID** do `ops:preflight` nêu, là
việc vận hành trên dữ liệu, không phải lựa chọn thiết kế còn ngỏ.)_

**Prompt 04 mục 9.10 (28/10/2026):** `OD-SA-FREE-CC` **đã đóng = A** (Owner 28/10/2026, giữ cổng 409 `FINANCE.SETUP_INCOMPLETE` ở mọi nhánh
của Request tài khoản dịch vụ). **`OD-CPE-04` = A, Owner chấp thuận ngày 28/10/2026, đã đóng:** áp dụng chính sách của
[L.12](#l12-đích-quay-về-phải-đọc-được-dữ-liệu-p04-cpe-04-prompt-04-mục-910-28102026), chấp nhận gián đoạn khi phục hồi không an toàn bị
từ chối và phải sửa tiến. Phương án thay thế (cờ hoãn ghi NULL) không được chọn. Chấp thuận không thay bằng chứng vận hành và action 9.

## Definition of Done

- [x] Owner đã trả lời mọi disposition _chặn_; câu trả lời ghi ở mục trên kèm ngày (27/10/2026: chín mục = A; hệ quả ở mục L).
- [ ] Mỗi finding trong phạm vi có test đỏ-trước/xanh-sau ở cấp phù hợp hoặc bằng chứng `aligned` sau thử (F25); finding ngoài phạm vi
      ghi disposition.
- [ ] Migration tiến diễn tập trên CSDL có dữ liệu ở `7c28e75` (và trên CSDL trống); `prisma migrate diff` không lệch;
      `ops:db-roles reconcile` + `verify` xanh; `ops:preflight`/`ops:inspect` nhận dữ liệu cũ; lượt đầu của việc đóng cuối năm (F62) trên
      CSDL diễn tập ghi số phiên bản/đề xuất được đóng và chạy lại không đổi.
- [ ] Lượt gate cuối xanh trên cây ổn định: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (PostgreSQL cô lập),
      `pnpm openapi:export` trùng byte hai lần, validator dialect/contract BE, `pnpm rules:check`, `pnpm rules:format`, `git diff --check`.
- [ ] Không thêm mục legacy ledger/allowlist; gỡ được mục nào thì xóa.
- [ ] Roadmap, scope map, spec/plan chủ, `AGENTS.md`, `ARCHITECTURE.md` phản ánh mã cuối; bàn giao FE/Mobile ghi đủ.
- [ ] Không stage/commit/push; báo cáo đủ theo `00-shared-instructions.md` §6.

## Changes and acceptance

- 26/10/2026 — Prompt 03: tạo hạng mục từ audit chỉ đọc G0–G6 trên Docs `769bb64` ↔ BE `7c28e75`; chưa có implementation, chưa Owner
  review, chưa nghiệm thu.
- 26/10/2026 — Prompt 03 (tiếp, cùng hạng mục): Owner pin Docs `e0cb5a0` (P03-D16 = A). Delta audit nguồn `769bb64..e0cb5a0` ↔ BE
  `7c28e75` (mã không đổi): F62 → F67 mới; F33, F36, F13, F61 mở rộng; P03-D08 đóng theo nguồn; mục I mới; phạm vi = bảng chuẩn impact
  matrix mục 3.0 (68 finding). Chưa implementation, chưa Owner review, chưa nghiệm thu.
- 26/10/2026 — Prompt 03 (tiếp, cùng hạng mục): khép lựa chọn hiện thực còn ngỏ — mục J: liên kết kế tiếp của đề xuất và ràng buộc CSDL
  (J.1), đối soát tất định dòng `RETURNED` cũ với `ops:preflight` chặn khi mơ hồ (J.2), contract `financeReviewComplete` cho Request
  đang chờ phiên bản (J.3), bảng lịch sử chỉ ghi thêm và `budgetVersionHistoryList` (J.4); F32 có mã `SPEND.REVIEWER_IS_APPROVER`. Chưa
  implementation, chưa Owner review, chưa nghiệm thu.
- 27/10/2026 — Prompt 03 (đóng, cùng hạng mục): Owner trả lời P03-D01 → P03-D07, P03-D09, P03-D11 = A; mục L chốt hệ quả (nháp và bốn
  operation; lệnh `pnpm ops:record-super-admin-event` và bảng phiếu; hai migration + lệnh `pnpm ops:assign-subscription-owner`; cột lịch
  sử chức vụ; bản `pg_dump` được bảo vệ; gỡ trực tiếp 17 operation; chặn PATCH tăng/kéo dài; nguồn giá theo phòng Request); thiết kế
  `ready`. Không còn disposition chặn. Chưa implementation, chưa Owner review tài liệu, chưa nghiệm thu.
- 27/10/2026 — Prompt 03 (sửa review `P03-RV-01`, cùng hạng mục): trình tự D03 của mục L.3 đổi thành mở rộng → gán → thu hẹp qua hai
  revision (Task 1.2a, 1.2b, 1.2c; một điểm dừng nội bộ `expansion-ready-owner-action` của Prompt 04); bỏ trình tự cũ dùng migration (B)
  lỗi có chủ đích và `prisma migrate resolve`. Quyết định Owner P03-D03 = A và mọi thiết kế J/K/L khác giữ nguyên. Chưa implementation,
  chưa Owner review tài liệu, chưa nghiệm thu.
- 27/10/2026 — Prompt 03 (sửa review `P03-RV-02`, cùng hạng mục): migration (A) chỉ cộng thêm — bỏ trigger chặn `owner_department_id`
  NULL trên `subscriptions` khỏi (A) vì H7 migrate trước recreate và phục hồi image cũ; bất biến ghi mới ở ứng dụng mở rộng; preflight và
  lệnh gán probe schema trước truy vấn; kiểm kê sống gồm dòng do image cũ tạo; (B) là migration đầu tiên của bản cuối và một mình đặt `NOT
NULL` + guard F02/F20, runtime mở rộng hợp lệ trên (A) + (B). Quyết định Owner và thiết kế khác giữ nguyên. Chưa implementation, chưa
  Owner review tài liệu, chưa nghiệm thu.
- 27/10/2026 — Prompt 03 (sửa review `P03-RV-03`, cùng hạng mục): mốc mở rộng thành **bản tương thích** với cùng điểm dừng duy nhất
  `expansion-ready-owner-action` — mọi phần cộng thêm và mọi chuyển ứng dụng khỏi đối tượng mà bản cuối thu hẹp/xóa (F01, F03, F04 → F06,
  F20, từ vựng enum, F63/F36) đi trước điểm dừng (Task 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a cạnh Task 1.2a); mọi migration của bản cuối tương
  thích với image tương thích đang chạy/được H7 phục hồi (mục L.10); F20 có mã chốt 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`
  (mục K); `cost_centers.department_id` NULL chỉ ở dòng chưa từng gắn phòng (mục A); dòng chuyển phòng tài khoản dịch vụ chờ hủy trên
  `7c28e75` trước bản tương thích (L.5); `pg_dump` chỉ là đường khẩn cấp. Quyết định Owner và thiết kế J/K/L khác giữ nguyên. Chưa
  implementation, chưa Owner review tài liệu, chưa nghiệm thu.
- 27/10/2026 — Prompt 03 (sửa review `P03-RV-04`, cùng hạng mục): bỏ ngoại lệ _Cost Center chưa từng gắn phòng giữ NULL_ của `P03-RV-03` vì trái `QĐ-87d`(1) — schema cuối `cost_centers.department_id`, `linked_at` NOT NULL (mục A, L.10); mục L.11 mới: bản tương thích chỉ tạo Cost Center có phòng (`costCenterCreate` contract cuối), `departmentCreate` contract cuối chờ một **bước kích hoạt** của operator sau khi H7 báo sẵn sàng (cơ chế Owner duyệt 27/10/2026 vì một binary không thỏa cả hai cửa sổ H7 — chứng minh ở L.11), lệnh `pnpm ops:cost-center-direction` (`activate`, `link`), kiểm kê sống `COST_CENTER_UNLINKED` gồm dòng muộn, migration thu hẹp đóng khi lỗi; vẫn một điểm dừng, không deploy boundary thứ hai. Disposition Owner P03-D01 → P03-D16 giữ nguyên. Chưa implementation, chưa Owner review tài liệu, chưa nghiệm thu.
