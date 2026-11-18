# SEED-AUDIT — dữ liệu seed demo `shared-demo-v4` (BE `feat/p5` @ `d3757876`)

Ngày audit: 17/11/2026. Reviewer chỉ đọc: không sửa code, không chạy pnpm/docker, không gọi API.

## 0. Skill preflight

| Skill | Vai trò | Dùng để |
| --- | --- | --- |
| `agent-skills:planning-and-task-breakdown` | process | Chia kế hoạch mở rộng seed thành bước nhỏ, theo thứ tự phụ thuộc, mỗi bước có tiêu chí nghiệm thu |
| `superpowers:verification-before-completion` | verification | Mọi kết luận ở đây đều kèm nguồn file:dòng hoặc trích log. Mục nào chỉ suy ra từ đọc tĩnh (chưa gọi API) được ghi rõ là **suy luận** |
| (domain/review) | — | Không có skill riêng cho "audit seed nghiệp vụ". Thay bằng cách đọc thẳng BRD, sổ QĐ, tài liệu FE và code |

Không đặt cờ áp dụng cho `CLAUDE.md` của repo BE: phiên này không đọc file đó, chỉ đọc README của fixture và `docs/guides/seed.md`.

---

## 1. Hiện trạng seed

### 1.1 Bằng chứng chạy

- Khối đầu của `/tmp/seed-final.log` là lượt `seed-local --continue`, `hôm nay 2026-11-17`: `Tổng: ĐÃ CÓ 1 · ĐÃ GHI 64 — mã thoát 0`. Mục `ĐÃ CÓ` duy nhất là `demo.budget-adjustments`, vì kỳ 2026 chưa khóa, đúng như thiết kế D-Z2-1.
- **Bất thường cần Owner xem.** Sau dòng tổng trên, log còn một khối thứ hai (dòng 81–101): `ĐÃ GHI 19 · LỖI 1 — mã thoát 1`. Lỗi ở `[LỖI] budget.next-year … POST /budget-attachments/015c276f-…/complete answered 500 INTERNAL_SERVER_ERROR`. Cuối file là `ELIFECYCLE Command failed with exit code 1`, và dòng 4 có `Stop pnpm start:worker before seeding.` Hai khả năng: khối này còn sót từ một lượt cũ ghi đè lên log, hoặc đây là lượt thật bị lỗi 500. Đọc tĩnh không phân biệt được. Nếu là lượt thật thì đó là lỗi 5xx của route upload tệp ngân sách, không phải lỗi dữ liệu seed.
- **Prompt 5 không đụng tới seed.** `git diff --stat 94a8ee84 HEAD -- src/cli/seed docs/guides/seed.md scripts/dev` ra rỗng. Toàn bộ dữ liệu seed vẫn là bản Z2 (`feat/fe-feedback`).

### 1.2 Bảng thực thể

Nguồn: `src/cli/seed/fixture/shared-demo-v4/README.md` và các tệp fixture, đối chiếu với log.

| Thực thể | Số lượng | Trạng thái/biến thể đang có | Ghi chú/khoảng trống |
| --- | --- | --- | --- |
| Tổ chức, phòng | 1 tổ chức; 9 phòng nghiệp vụ + phòng gốc `ADMIN` | Có các ca: phòng không trưởng phòng (LGL), không Cost Center (OPS), ngân sách sát mức (MKT/DES/SAL) | Phòng `ADMIN` chỉ có Super Admin, thiếu trưởng phòng/IT Admin/CC (xem §2) |
| Nhân viên | 41 + NV-SA | Có STAFF, nhà thầu (CTR1), thực tập (INT1/2), người không có tài khoản; dồn chủ yếu ở ENG (9) và DES (13). MKT, SAL mỗi phòng 3; FIN 2; BOD 2; LGL 1; OPS 3 | Chưa có `unplaced` (chưa xếp phòng), chưa có người đã nghỉ trong quá khứ (`QĐ-99k(b)`), chưa có lần import nhân sự (`employee-imports`) |
| Tài khoản | 30 + Super Admin | Mỗi tài khoản một vai: 1 SPENDING_APPROVER, 1 FINANCE, 4 IT_ADMIN, 8 MANAGER, 16 EMPLOYEE | Chưa có tài khoản bị khóa, lời mời chưa kích hoạt, lời mời quá hạn (`INVITATION_*`) |
| Ứng dụng | 13 (12 SAAS + 1 INTERNAL); 12 nhà cung cấp | Đủ 7 nhóm chức năng; độ nhạy dữ liệu LOW/MEDIUM/HIGH | **< 20 dòng: không thấy phân trang**. Chỉ JetBrains có 2 gói. Chưa có ứng dụng ngừng (`application-retirement`) |
| Gói | 14: K2 × 8, K1 × 3, K4 × 2, K5 × 1 | `controlLevel` chỉ có FULL (K2/K4) và PARTIAL (K1); `sharingPolicy` chỉ `NOT_ALLOWED` | **Chỉ 1 gói trả theo năm** (Figma). Chưa có gói K4 trả theo kỳ, gói nhiều bậc giá trong cùng ứng dụng, `plan-terms`, `plan-warnings` |
| Thuê bao kho | 13 (mỗi gói một) | Kho dùng chung; 1Password hết ghế; DataGrip 0 khóa; Canva thiếu email chủ; Mailchimp sắp thiếu admin | Toàn bộ gói tháng: start `Y-01-01`, end `Y-12-31`, autoRenew (`catalog.steps.ts:225-238`). Không có thuê bao đã hủy, nháp, hết hạn |
| Ghế/assignment | Ghế nền khoảng 50 + Request đã cấp 9 | Đủ Trống, Đã gán, có hạn (DES10 20 ngày, DES12 35 ngày, SAL2 7 ngày), tài khoản máy (ITA3 Slack) | Ghế chỉ ở 8 ứng dụng. Chưa có ghế đã hết hạn chờ thu hồi, chưa có hoàn trả (`return-requests`) |
| Hợp đồng | 2 (`SV-HD-ATL-01` K2, `SV-HD-JB-01` K4) | Có tệp | Ít; chưa có hợp đồng thiếu dữ liệu (`CONTRACT_DATA_INCOMPLETE`) |
| Hóa đơn mua | 4 (`SV-INV-001…004`) | SUBMITTED, CONFIRMED × 2 (một bản lệch số lượng, `SBF-11a`), RETURNED | Chỉ Jira, Slack, GitHub, Postman. Chưa đủ để lọc/phân trang |
| Request MF-1 | 31 Request + 1 nháp + R33 tiếp tục | PENDING, WAITING_CONTROLLED, REJECTED (bước nhu cầu), WITHDRAWN, AWAITING_SPEND_SUBMISSION (+RESERVE_CONFIRMATION, BLOCKED), AWAITING_SPEND_DECISION, AWAITING_EXECUTION, AWAITING_IT_ASSESSMENT, COMPLETED, DRAFT | **Thiếu** `AWAITING_REQUESTER_REVISION`, `IT_REJECTED`, `EXECUTING`, `FAILED`, `AWAITING_IT_CLOSE`, `CANCELLED`; thiếu duyệt chi **từ chối** và **trả về**; thiếu dòng nhóm bị quyết riêng (`group-lines`) |
| Ghost seat | Đủ G1 (7 gói), G2 × 4 (OFF1), G3 × 1, G4 × 5 cùng các bẫy; quyết định KEEP/RECLAIM/EXEMPT/tự quyết | Toàn bộ G3/G4 nằm ở **DES** | Chỉ trưởng phòng DES có hàng chờ ghost seat; 7 trưởng phòng khác thấy rỗng |
| Usage | 3 nguồn vendor (Figma, Jira tươi; Canva quá cũ) | Có định danh chưa khớp | Không có usage từ collector/thiết bị; các ứng dụng khác không có usage |
| Thiết bị/collector | **0** | — | Thiết bị, thông báo giám sát, xác nhận đọc, enrollment, allowlist, AI usage, tool-status, **yêu cầu dừng thu thập (P5)** đều rỗng |
| Ngân sách | Kỳ Y mở → khóa D0+1; Y+1 mở; Y+2 nháp | Y: 7 phòng đã duyệt. Y+1: APPROVED, PROPOSAL_SUBMITTED, VERSION_SENT, VERSION_RETURNED, không nộp. Chốt tháng 1–10 và giải trình quý | Điều chỉnh chỉ có khi chạy lại ngày D0+1. Seat-tháng chỉ tính từ ngày seed (`NL-1`) |
| Sự kiện nhân sự | 4 | Nghỉ dài (DES7), BLOCK_NOW (OFF1), WITH_LAST_DAY (ITA4, bàn giao IT PENDING), điều chuyển ngày mai (DEV4) | Chưa có nghỉ đột ngột, nghỉ dài đã quay lại, điều chuyển trưởng phòng có kế nhiệm |
| BM-09 | 1 | Chờ xác minh (ENGH báo DEV3) | Chưa có thông báo đã gắn sự kiện, bị từ chối, quá hạn |
| Báo lỗi SaaS | 1 | Vừa gửi (ghế R01) | Chưa có thông báo đang xử lý, đã giải quyết, mở lại, trùng |
| Ca ngoài quy trình | 1 (SAL1 Jira, `SBF-07a`) + SBF-08 DEV2 | Finance đã ghi phần đã chi | — |
| Chính sách | Bộ khởi tạo + `POL-MF2` bản 2 chờ xác nhận lại | — | — |
| Thông báo | Sinh phụ theo các thao tác ở trên (**suy luận**) | Xem §1.4 | Nhiều mã mới của P5 chưa phát sinh |
| AI | 0 lời gọi | Mặc định `AI_ENABLED=OFF`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED=OFF`, `AI_PROVIDER_MODE=SIMULATED` (`parameter-definitions.policy.ts:401-433`) | Màn lịch sử gọi AI của Super Admin rỗng; nút "Tóm tắt bằng AI" bị tắt |

### 1.3 Phần prompt 5 mới thêm, đối chiếu với seed

| Tính năng P5 | Seed hiện có | Ghi chú |
| --- | --- | --- |
| Điểm điều chỉnh SBF-20 (`GET /subscription-renewals/adjustment`, `POST /subscription-renewals`, `…/outcome`, `GET /subscription-deadline-events`) | **Gián tiếp** | Figma là gói năm, gia hạn sau D0+50, báo trước 30 ngày ⟹ deadline D0+20, điểm mở từ D0−10 (cửa sổ năm 30 ngày, `subscription-obligation.policy.ts:141-152`). Vậy Figma đang **trong cửa sổ** từ ngày seed. Báo động đỏ bật từ D0+13 (mặc định 7 ngày). Gói tháng (grid neo ngày 31/12) có ngày trả kế tiếp 30/11, điểm mở 23/11: **ngày demo 18/11 không có gói tháng nào trong cửa sổ**. Không có lượt điều chỉnh nào được ghi ⟹ danh sách `subscription-renewals` rỗng, `OUTCOME_RECORDED`, `KEPT`, `AUTO_RENEWAL_INCIDENT`, `EXPIRY_MARKED` đều không có |
| Yêu cầu dừng thu thập (`POST /me/device-registrations/:id/stop-requests`, `GET /device-stop-requests`, `…/completion`) | **0** | Không có thiết bị nên không có dữ liệu |
| Thông báo mới (`SPEND_BATCH_SUBMITTED`, `SAAS_ISSUE_*`, `OUT_OF_PROCESS_CASE_REPORTED`, `VENDOR_ACCOUNT_DISCREPANCY_OPENED`, `DEVICE_STOP_*`, `SUBSCRIPTION_RENEWAL_RED_ALERT/KEPT/OUTCOME_RECORDED`) | **Một phần** (suy luận) | Seed có trình lô ⟹ Người duyệt chi có `SPEND_BATCH_SUBMITTED`. Có báo lỗi SaaS ⟹ `SAAS_ISSUE_SUBMITTED`. Có SBF-08/07a ⟹ có thể có `VENDOR_ACCOUNT_DISCREPANCY_OPENED`/`OUT_OF_PROCESS_CASE_REPORTED`. Không có `DEVICE_STOP_*`, `SAAS_ISSUE_STATE_CHANGED`, `…OUTCOME_RECORDED`, `…KEPT` |
| `AI_PROVIDER_MODE` | Mặc định `SIMULATED` | AI tắt nên chưa có lời gọi nào ghi `provider_mode` |

### 1.4 Thông báo theo vai (suy luận từ thao tác seed, cần kiểm bằng `GET /notifications` từng vai)

- **Super Admin:** có `PERSONNEL_NOTICE_RECEIVED`, `DEPARTMENT_WITHOUT_HEAD`/`CONTROLLED_WAIT_ALERT` (LGL), `IT_ADMIN_HANDOVER_PENDING`, cờ audit R28.
- **IT Admin** (dồn vào ITA1/ITA2): `STEP_ASSIGNED` hàng cấp, `GHOST_SEAT_*`, `SAAS_ISSUE_SUBMITTED`, `USAGE_*`, `DEPARTMENT_SOFTWARE_PROPOSED`, `SUBSCRIPTION_RENEWAL_ALERT` (Figma, do job theo giờ). ITA3 gần như rỗng.
- **Trưởng phòng:** ENGH và DESH nhiều. MKTH, SALH, ITOH, FINH, DEP, OPSH ít, chủ yếu `BUDGET_*` và `POLICY_PUBLISHED`.
- **Người duyệt chi:** `SPEND_BATCH_SUBMITTED`, `STEP_ASSIGNED`, `BUDGET_VERSION_AWAITING_DECISION`.
- **Finance:** `BUDGET_*`, `PURCHASE_INVOICE_SUBMITTED`.
- **Employee:** `REQUEST_*` của chính mình. Nhân viên MKT2, SAL2, OPS1, LGL1 có rất ít.

Danh mục có **129 mã thông báo** (`notifications.types.ts`). Ước tính seed chạm khoảng 40–50 mã. Các nhóm chưa phát sinh: hoàn trả (`RETURN_*`), lỗi cấp/thu hồi (`REQUEST_FAILED`, `GRANT_TASK_CANCELLED`), `REQUEST_IT_REJECTED`, `REQUEST_RETURNED*`, `REQUEST_CANCELLED_BENEFICIARY_GONE`, `BUDGET_ADJUSTMENT_*` (chỉ có ở lượt chạy D0+1), SLA (`STEP_SLA_*`, theo thời gian), `DEVICE_*`, `SUBSCRIPTION_SEATS_INCREASED` (README đã ghi lý do không có).

---

## 2. Super Admin có thuộc phòng ban không

### 2.1 Code đang làm gì

- Seed **không** xếp phòng cho Super Admin. Việc đó do **lệnh cài đặt** làm (bootstrap, `--allow-bootstrap`):
  - `src/modules/installation/public/installation.api.ts:21-29`: *"Creates … ONE first department with no Cost Center, head or IT Admin in charge, the Super Admin's employee in that department (no job title)…"*.
  - Fixture `src/cli/seed/fixture/shared-demo-v4/installation.ts:6-7` (`departmentCode: 'ADMIN'`, `departmentName: 'Quản trị hệ thống'`) và `:9-15` (NV-SA). Dòng 1 ghi: *"organization steps never reuse this department or employee"*.
- Các bước `org.*` chỉ tạo 9 phòng nghiệp vụ (log: `org.departments … BOD, ENG, DES, FIN, ITO, MKT, SAL, LGL, OPS`), không xếp ai thêm vào `ADMIN`.
- Tài liệu FE đã ghi điều này: `Figma UI-UX/API-Integration/demo/accounts.md:19` có `| Super Admin | system.admin@… | NV-SA | ADMIN (phòng gốc) | SUPER_ADMIN |`.

### 2.2 Nguồn nghiệp vụ nói gì

- **BRD `FR-8.7`** (`Requiments/BRD - … .md:1282`): *"Super Admin **vẫn thuộc một phòng** nhưng **không** gửi Request (`SoD-1`, `FR-8.5`) — phần mềm Super Admin cần là quyền theo vai"*.
- **`QĐ-87f(1)`** (`Decisions/project-decisions.md:191`): lệnh khởi tạo tạo *"một phòng khởi đầu thật chưa có Cost Center/trưởng phòng/IT Admin phụ trách, **hồ sơ của người giữ vai Super Admin thuộc phòng đó**"*.
- **`QĐ-67a`** (`project-decisions.md:226`): *"Employee của người giữ vai Super Admin thuộc phòng đó … Super Admin vẫn không làm trưởng phòng"*.
- **`QĐ-67b`** (`:227`): *"Phòng khởi đầu là giá trị thật, không giữ chỗ (cấm phòng/Cost Center kiểu Chưa phân loại)"*.
- **`SoD-1`** (BRD `:301`), `QĐ-39b` (`:164`), `QĐ-95d` (`:200`): Super Admin không làm trưởng phòng, không gửi Request. Các nguồn này **không** cấm Super Admin là thành viên một phòng.
- `SBF-01` (`Diagrams/supporting-business-flows/SBF-01-organization-setup-initial-data.md:36`) mô tả cùng lệnh khởi tạo.
- Grep `không thuộc phòng`, `không có phòng`, `không xếp phòng` trong BRD, sổ QĐ, `roles/`, `demo/`: **không có nguồn nào nói Super Admin không thuộc phòng ban**.

### 2.3 Kết luận

- **Seed không lệch luật.** Super Admin thuộc đúng một phòng là yêu cầu của BRD `FR-8.7` và `QĐ-87f`/`QĐ-67a`. Phản ánh "Super Admin không thuộc phòng ban nào" của FE trái với nguồn; FE không nên ẩn hay coi đó là lỗi.
- **Điểm có thể gây hiểu nhầm:**
  - Phòng `ADMIN — Quản trị hệ thống` chỉ có một người và thiếu trưởng phòng, IT Admin phụ trách, Cost Center. Vì vậy nó hiện trong `departmentWarningList`, trong cảnh báo thiếu Cost Center (có thể cả `BUDGET_COST_CENTER_SETUP_DUE`) và được đếm là phòng thứ 10.
  - README fixture viết "phòng gốc", trong khi mô hình là phòng phẳng (`QĐ-52`): chữ "gốc" dễ hiểu sai thành phòng cha.
- **Cách xử lý (Owner chọn):**
  - **A (khuyến nghị, không đổi code):** giữ nguyên. Sửa tài liệu FE (`demo/accounts.md`, `roles/super-admin.md`), thay "phòng gốc" bằng "phòng khởi đầu do lệnh cài đặt tạo (`QĐ-87f`)" và nói rõ Super Admin thuộc phòng này theo `FR-8.7`. Có thể thêm vào README fixture một câu giải thích cảnh báo của `ADMIN`.
  - **B:** chọn phòng khởi đầu là một phòng nghiệp vụ thật, ví dụ `ITO — Phòng Công nghệ thông tin`:
    - đổi `installation.ts` `departmentCode/departmentName`;
    - `org.departments` bỏ qua ITO vì đã có (bước tìm theo mã);
    - gán trưởng phòng và IT Admin cho ITO như hiện nay.

    Hệ quả: hết phòng 1 người và hết cảnh báo, Super Admin nằm ở phòng CNTT. Nhưng phải reset DB, sửa test fixture và sửa câu ở `installation.ts:1`.
  - Không chọn phương án "Super Admin không phòng" (`unplaced`): trái `FR-8.7` và `QĐ-87f`.

---

## 3. Khoảng trống theo màn/luồng FE

Kích thước trang mặc định là `pageSize=20` (ví dụ `budget.dto.ts:136`, `audit-event.dto.ts:14`). Danh sách dưới 21 dòng sẽ không cho thấy phân trang.

### 3.1 Theo vai

| Vai | Màn rỗng hoặc chỉ 1 dòng | Nhánh không có dữ liệu | Cần nhiều dòng để thấy phân trang/lọc |
| --- | --- | --- | --- |
| Super Admin | Lịch sử gọi AI (0); hàng import nhân sự (0); thiết bị/thông báo giám sát (0); bảng nghẽn SLA/sự cố (`/congestion/incidents`, 0); BM-09 (1) | Nhân viên chưa xếp phòng; tài khoản khóa/lời mời quá hạn; BM-09 đã gắn/bị từ chối; nghỉ đột ngột; điều chuyển trưởng phòng có kế nhiệm | Audit (đủ); nhân viên (42, đủ); tài khoản (31, đủ) |
| IT Admin | `subscription-renewals` (0); yêu cầu dừng thu thập (0); thiết bị (0); hoàn trả (0); hàng hết hạn (`assignment-expiry-queue`, gần như 0); vendor dictionary (0); `plan-warnings` (0); báo lỗi SaaS (1) | Tác vụ cấp **thất bại**/thử lại/bàn giao/đóng lỗi (`report-failure`, `retry`, `hand-off`, `close-failed`); `IT_REJECTED`; trả lại người yêu cầu (`AWAITING_REQUESTER_REVISION`); ghi kết quả SBF-20 (INCREASE/REDUCE/CANCEL); ngừng ứng dụng | **Ứng dụng (13), gói (14), thuê bao (13)**: dưới 20. Hóa đơn (4), hợp đồng (2) |
| Trưởng phòng | Hàng ghost seat của mọi phòng **trừ DES**; hàng nhu cầu của MKTH/SALH/FINH/DEP/OPSH (0–1); hàng trình lô ngoài ENG/DES/SAL | Ghost seat của trưởng phòng khác DES; Request nhóm có dòng bị từ chối riêng; nhận Request bị Người duyệt chi trả về | Hàng nhu cầu ENGH (đủ vài dòng); thành viên phòng ENG/DES (đủ) |
| Người duyệt chi | — (R02, R10, R12, R31 chờ; 1 phiên bản ngân sách chờ) | Duyệt chi **từ chối** và **trả về**; lô có nhiều Request trộn | Hàng duyệt chi chỉ 4 dòng |
| Finance | Hóa đơn chi phí kỳ (`budget-invoices`, chưa thấy seed); hồ sơ thuế chỉ **1 nhà cung cấp**; vendor list chưa có lọc thuế | Hóa đơn trả lại có sửa và nộp lại; ngưỡng 80/100 % (`NL-1`); điều chỉnh (chỉ từ D0+1) | Hóa đơn mua (4); nhà cung cấp (12) |
| Employee | Hoàn trả; thiết bị của tôi; yêu cầu dừng thu thập; usage của tôi ngoài Figma/Jira | Request bị IT từ chối hoặc trả lại để sửa; Request thất bại; Request bị hủy vì người thụ hưởng nghỉ | "Phần mềm của tôi" của DEV1/DEV2 đủ; MKT2/SAL2/OPS1 rất ít |

### 3.2 Theo luồng

| Luồng | Có | Khoảng trống |
| --- | --- | --- |
| MF-1 | 10 trạng thái, nhóm, dự phòng, chặn, K1/K2/K4/K5, case B, tiếp tục | Thiếu 6 trạng thái và 2 nhánh duyệt chi nêu ở §1.2. Chỉ ENG có nhiều Request. Danh mục quá ít để màn "xin phần mềm" trông thật |
| MF-2 | BLOCK_NOW, WITH_LAST_DAY + bàn giao IT | Quá hạn thu hồi chỉ có sau hạn (DEMO-6); chưa có nghỉ đột ngột (`ABRUPT_DEPARTURE_RECORDED`); chưa có trưởng phòng nghỉ (bắt buộc kế nhiệm) |
| MF-3 | DEV4 ngày mai | Chưa có điều chuyển đã đóng; chưa có điều chuyển của trưởng phòng |
| MF-4 | Rất đủ | Chỉ 4 phòng có Y+1 khác "không nộp"; điều chỉnh phụ thuộc ngày |
| MF-5 | G1–G4 + bẫy, chỉ ở DES | Usage chỉ 3 ứng dụng; ghost seat chỉ một phòng; chưa ghi kết quả điều chỉnh thuê bao (SBF-20, nửa sau của MF-5) |
| SBF-03/03a | Ghế có hạn, R33 tiếp tục | Không có hoàn trả, không có ghế đã hết hạn chờ thu hồi |
| SBF-05/05a | — | **Rỗng hoàn toàn** (thiết bị, xác nhận đọc, kết quả collector, dừng thu thập) |
| SBF-09 | 1 báo lỗi vừa gửi | Không có các bước chuyển trạng thái |
| SBF-13 | 1 BM-09 chờ | Không có BM-09 đã xử lý |
| SBF-15 | 3 chờ thẩm định | Chưa có ca thẩm định xong → nhận vào danh mục (`application-intake`) |
| SBF-17/18 | — | Không có tác vụ cấp hoặc thu hồi thất bại |
| SBF-19/11/11a | 4 hóa đơn, chốt tháng | Ít dòng; hóa đơn chỉ ở 4 thuê bao |
| SBF-20 | Figma trong cửa sổ | Không có lượt nào đã ghi; không có sự cố gia hạn tự động hay đánh dấu hết hạn |

---

## 4. Kế hoạch mở rộng seed (để một chat Sonnet code)

### 4.1 Ràng buộc phải giữ

1. **Ghi qua HTTP API đúng vai**, không chèn SQL. Chỉ ghi những trạng thái mà API cho phép.
2. **Idempotent:**
   - Mỗi bước tìm bản ghi theo khóa nghiệp vụ trước khi ghi: tên ứng dụng/gói, số hợp đồng/hóa đơn, thẻ `[SV-Rnn]`, mã nhân viên, email.
   - Runner đánh giá lại mọi bước mỗi lượt (`seed-runner.ts`). Lỗi 4xx thành `conflict`, các bước không phụ thuộc vẫn chạy tiếp. Lỗi 5xx dừng cả lượt.
   - Bước đã đủ phải trả `present` để lượt chạy lại ra mã thoát 2.
3. **`--continue`:** bước mới được thêm **sau** các bước hiện có hoặc trong nhóm của nó, có `needs` đúng. Thêm phần tử vào mảng của bước cũ (ví dụ `APPLICATIONS`) vẫn chạy được trên DB đã seed. **Ngoại lệ:** ghế nền (`catalog.baseline-seats`) đóng sau `catalog.baseline-close`, nên ghế nền mới **chỉ có khi reset DB** (xem Q2).
4. **Không làm vỡ ca hiện có** (các bất biến README đang dựa vào):
   - MKT, DES, SAL không có Request nào khác giữ hoặc chờ ngân sách (R10, R21, R11);
   - 1Password còn 0 ghế Trống (R15), DataGrip 0 khóa (R20), GitHub còn Trống (R22);
   - LGL không có trưởng phòng, OPS không có Cost Center;
   - không thêm usage cho ghế bẫy DES;
   - Miro, Whimsical, "Canva Enterprise" **không** được vào danh mục (R08, R25, R29);
   - không thêm IT Admin phụ trách phòng thứ 5 cho ITA1/ITA2 (`QĐ-110l`).
5. **SoD:**
   - Super Admin không gửi Request, không cấp ghế, không tạo Cost Center;
   - NV-CEO không là người yêu cầu/thụ hưởng;
   - Request của IT Admin đi qua NV-ITOH; Request của trưởng phòng là một bước;
   - mỗi tài khoản một vai;
   - không ai thao tác hồ sơ/sự kiện về chính mình;
   - người nghỉ là trưởng phòng phải có kế nhiệm.
6. **Tổ chức fixture:** dữ liệu ở `fixture/shared-demo-v4/*.ts` theo chủ đề như mục "Thêm dữ liệu" của README; nên tách tệp mới (`devices.ts`, `renewals.ts`, `catalog-extra.ts`) khi một tệp vượt khoảng 300 dòng. Mở rộng `DemoRequestTarget` và `ScenarioAction` trong `scenario-path.ts` cho các trạng thái mới. Cập nhật README fixture, `docs/guides/seed.md` nếu cần, và tài liệu FE `demo/*.md`.
7. **Giới hạn Request mở mỗi người:** README ghi tối đa 3 (GH-2), còn tham số `REQUEST_OPEN_NEW_LIMIT` mặc định 10 (`parameter-definitions.policy.ts:113-117`). Sonnet cần kiểm luật thật trước khi xếp thêm Request cho cùng một người; nên dùng nhân viên mới.

### 4.2 Các bước đề xuất (theo thứ tự phụ thuộc)

Ký hiệu: **[mới]** bước mới, **[sửa]** thêm phần tử vào bước cũ. Kích thước theo skill planning: S = 1–2 tệp, M = 3–5 tệp.

| # | Bước (key) | Dữ liệu | Route · vai | Dùng cho màn/DEMO | Cỡ |
| --- | --- | --- | --- | --- | --- |
| 1 | [sửa] `org.employees`, `org.accounts` | Thêm khoảng 10 người ở MKT (+3), SAL (+2), FIN (+1 nhân viên), BOD (+1), OPS (+1), ITO (+2) để có người gửi Request mới mà không vượt giới hạn mở. Thêm 1 người **chưa xếp phòng** có tài khoản EMPLOYEE (`QĐ-93g`) | `POST /employees`; tài khoản qua `DemoAccountsApi` như hiện nay · Super Admin | Danh sách nhân viên lọc `unplaced`; nút "Xếp phòng" | S |
| 2 | [mới] `org.employee-import` | Một lần import CSV ở trạng thái **preview chưa xác nhận** (có 1–2 dòng lỗi: mã phòng không tồn tại, email trùng) và một lần đã xác nhận (2–3 người mới). Có thể gộp một dòng người **đã nghỉ trong quá khứ** (`QĐ-99k(b)`) nếu API còn cho sau khởi tạo; kiểm trước | `POST /employee-imports`, `…/{id}/confirmations` · Super Admin | Màn import nhân sự (SBF-01a) | S |
| 3 | [mới] `org.account-states` | 1 tài khoản bị khóa (kèm lý do, `QĐ-81`); 1 lời mời chưa kích hoạt | `POST /app-users/{id}/locks` (kiểm route) · Super Admin | Quản lý tài khoản, lọc trạng thái | S |
| 4 | [sửa] `catalog.applications`, `catalog.plans` | Thêm khoảng 12 ứng dụng / 18 gói từ nhà cung cấp mới (tổng ≥ 25 ứng dụng, ≥ 32 gói). Ví dụ: Microsoft 365 (K2 Business Basic **tháng**, Business Standard **năm**); Google Workspace (K2 Starter tháng, Standard năm); Zoom (K2 Pro tháng); Notion (K2 Plus năm); Confluence (Atlassian, cùng nhà cung cấp Jira, K2); Adobe Creative Cloud (K2 Teams năm, `dataLossOnRemoval`); GitHub Copilot (K1); Midjourney (K1, giá gốc USD); Microsoft Visio (K4 mua đứt có khóa); Sublime Text (K4 không trang quản trị); 2 phần mềm nội bộ K5 (Chấm công, Văn bản nội bộ). Đa dạng `controlLevel` (FULL/PARTIAL/**NONE**), `sharingPolicy`, `dataSensitivity`, nhóm chức năng. **Không** thêm Miro/Whimsical/Canva Enterprise | `POST /applications`, `POST /plans` · IT Admin phụ trách (ITA1/ITA2/ITA3) | Danh mục có phân trang/lọc theo kiểu K, nhóm, nhà cung cấp; màn xin phần mềm | M |
| 5 | [sửa] `catalog.workspace-profiles` | Hồ sơ hai IT Admin cho mọi K2 mới và K4 có trang quản trị (Visio); một gói cố ý không ghi email công ty | `PUT /plans/{id}/workspace-profile` · IT Admin | Cờ admin nhà cung cấp (DEMO-9) | S |
| 6 | [sửa] `catalog.subscriptions` + [mới] `catalog.plan-terms` | Mỗi gói mới một thuê bao: giá khác nhau, gói **năm** với `renewalInDays` lần lượt **120** (ngoài cửa sổ), **25** (trong cửa sổ, chưa đỏ), **8** (báo động đỏ), một gói năm **có hạn hủy khai báo**; một gói năm `autoRenew` có `renewalDate` **trong quá khứ gần** (D0−3) để job giờ ghi `AUTO_RENEWAL_INCIDENT` (**kiểm API có nhận ngày quá khứ không**). Số mua và số Trống khác nhau. Điều khoản gói (`PUT /plans/{id}/terms`) cho 2–3 gói | `POST /subscriptions`, `…/completions`, `PUT /plans/{id}/terms` · IT Admin | Danh sách thuê bao ≥ 21; SBF-20; `plan-warnings` | M |
| 7 | [sửa] `assets.keys` | Kho khóa cho Visio (3 khóa) | `POST /license-keys/imports` · IT Admin | K4 gán khóa | S |
| 8 | [sửa] `catalog.baseline-seats` (**chỉ hiệu lực sau reset**) | Ghế nền cho ứng dụng mới, rải đều các phòng ENG/MKT/SAL/FIN/BOD/ITO (ví dụ M365 cho hầu hết, Zoom cho SAL/MKT, Adobe cho MKT/DES); vài ghế có `expected_end_date` **đã qua** để có hàng hết hạn chờ thu hồi (kiểm template có nhận không) | CSV `seatBaselineImport` · IT Admin phụ trách CNTT | Thuê bao có Trống/Đã gán; `assignment-expiry-queue`; usage nhiều ứng dụng | M |
| 9 | [sửa] `finance.tax-profile` | Hồ sơ thuế cho 4–5 nhà cung cấp nữa (trong nước/ngoài nước) | `PUT /vendors/{id}/tax-profile` · Finance | Danh sách nhà cung cấp và ước tính thuế | S |
| 10 | [sửa] `requests.*` + mở rộng `scenario-path.ts` | Request mới **chỉ trên ứng dụng/gói mới**, người gửi ở ENG/BOD/FIN/ITO (ngân sách rộng). Thêm target: `SPEND_REJECTED` (Người duyệt chi từ chối), `SPEND_RETURNED` (trả về), `IT_REJECTED` (`…/assessment/rejection`), `AWAITING_REQUESTER_REVISION` (trả lại người xin ở thẩm định), `EXECUTING` (IT đã nhận tác vụ, chưa xong), `FAILED` (`report-failure` → `close-failed`), `AWAITING_IT_CLOSE` (rút khi cấp đã lỗi), `CANCELLED`. Thêm 1 Request nhóm có **một dòng bị từ chối riêng** (`group-lines`), 1 Request K5 nội bộ đã cấp ở phòng khác, và khoảng 6 Request PENDING/AWAITING_SPEND_DECISION trải ở nhiều phòng để hàng chờ của 6 trưởng phòng và của Người duyệt chi có ≥ 5 dòng | `/access-requests*`, `/need-decisions`, `/spend-batches`, `/access-requests/{id}/spend-approval`, `/assessment*`, `/provisioning-tasks*` · đúng vai từng bước | MF-1 mọi trạng thái; hàng chờ từng vai; thông báo `REQUEST_IT_REJECTED/FAILED/RETURNED*` | M–L (chia 2: 10a target mới + path; 10b dữ liệu) |
| 11 | [mới] `requests.returns` | Hoàn trả: 1 đã xong (IT hoàn tất thu hồi), 1 đang chờ IT, trên ghế mới hoặc ghế R18 | `POST /return-requests` · Employee; `/provisioning-tasks/{id}/claim`, `revocation-completion` · IT Admin | SBF-03a; `RETURN_*` | S |
| 12 | [sửa] `saas.issue` | Thêm 3 báo lỗi: đang xử lý (có tin nhắn), đã giải quyết, mở lại; một báo lỗi trùng | `POST /saas-issues`, `…/messages`, `…/transitions`, `…/reopening`, `…/duplicate` · Employee/IT Admin | SBF-09; `SAAS_ISSUE_STATE_CHANGED` | S |
| 13 | [sửa] `personnel.notice` + `personnel.events` | BM-09: 1 đã gắn sự kiện (`link-event`), 1 bị từ chối, từ hai trưởng phòng khác nhau. Sự kiện: 1 nghỉ đột ngột (nhân viên mới ở SAL); 1 nghỉ dài có ngày quay lại trong tương lai gần | `POST /personnel-notices`, `…/link-event`, `…/rejection`; `POST /offboarding-cases`, `POST /long-leaves` · trưởng phòng / Super Admin | SBF-13, MF-2, SBF-02 | M |
| 14 | [mới] `usage.more-sources` + [sửa] `usage.imports` | Nguồn usage cho Slack, GitHub, M365, Zoom (CSV), cửa sổ 120 ngày kết thúc hôm qua. Thêm 1–2 G3/G4 **ở MKT và SAL** (một ghế không dùng, một ghế không hoạt động 70–80 ngày) trên ứng dụng **mới**, không đụng ngân sách R10/R11 | `POST /usage-sources`, import usage · IT Admin phụ trách ứng dụng; `POST /ghost-seat-rule-runs` | MF-5 cho nhiều trưởng phòng; tổng quan usage | M |
| 15 | [mới] `renewals.adjustments` (SBF-20) | Ghi kết quả ở **gói năm trong cửa sổ** (gói renewalInDays 25 ở bước 6): một lần `INCREASE` hoặc `REDUCE` do IT phụ trách ghi; một lần do **IT Admin khác** ghi (thông báo cho người phụ trách); **để nguyên Figma** cho demo ghi tay. Đọc `GET /subscription-renewals/adjustment` trước để gửi đúng `target` (ghi sai số bị từ chối). Một kết quả `…/outcome` cho ca còn chờ, nếu có | `POST /subscription-renewals`, `POST /subscription-renewals/{id}/outcome` · IT Admin | Danh sách renewal; `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`; `subscription-deadline-events` | M |
| 16 | [mới] `devices.registry` (SBF-05) | Super Admin xuất bản thông báo giám sát; IT Admin đăng ký 4–5 máy công ty cho DEV1, DEV2, DES1, MKT1, ITA3; 3 người xác nhận đọc, 1 chưa; 1 máy đổi người giữ, 1 máy ngừng | `POST /monitoring-notice-versions` · Super Admin; `POST /devices`, `…/holder-changes`, `…/retirements` · IT Admin; `POST /me/device-registrations/{id}/acknowledgements` · Employee | Màn thiết bị (IT, Employee, Super Admin) | M |
| 17 | [mới] `devices.collector` (SBF-05a, **rủi ro cao**) | Phát mã enrollment, enrollment công khai, phiên thiết bị, `POST /collector-allowlist-versions`, rồi đẩy `ai-usage-batches` và `ai-tool-status-snapshots` bằng **token thiết bị** (`DeviceAuthenticated`) cho 2–3 máy | `POST /device-registrations/{id}/enrollment-codes` · IT Admin; `POST /device-enrollments` (Public); `/device-session`; batch bằng token thiết bị | Usage AI trên `devices/{id}/usage`, `me/devices/{id}/usage`, tool-status | L (cần spike xem `DemoApiClient` có mang được token thiết bị và chữ ký `signature-records` không) |
| 18 | [mới] `devices.stop-requests` (P5) | 1 yêu cầu dừng **chờ** IT (`DEVICE_STOP_REQUESTED`), 1 **đã hoàn tất** | `POST /me/device-registrations/{id}/stop-requests` · Employee; `POST /device-stop-requests/{id}/completion` · IT Admin | Màn yêu cầu dừng thu thập | S |
| 19 | [mới] `ai.simulated` (Q4) | Bật `AI_ENABLED=ON` và `AI_ACCESS_REQUEST_SUMMARY_ENABLED=ON`, giữ `AI_PROVIDER_MODE=SIMULATED`. NV-ENGH gọi tóm tắt hàng nhu cầu; NV-CEO gọi tóm tắt hàng duyệt chi | `PUT /operating-parameters/{key}` · Super Admin; `POST /ai/access-request-summaries` · trưởng phòng / Người duyệt chi | Nút AI; lịch sử gọi AI và nội dung (`…/{invocationId}/content`) của Super Admin | S |
| 20 | [sửa] `demo.contracts`, `demo.purchase-invoices` | Thêm 3–4 hợp đồng (M365, Adobe, Visio K4; một hợp đồng thiếu ngày gia hạn ⟹ `CONTRACT_DATA_INCOMPLETE`); thêm khoảng 6 hóa đơn trên thuê bao mới (đủ SUBMITTED/CONFIRMED/RETURNED, một hóa đơn trả lại đã nộp lại) | `POST /contracts`, `/contracts/{id}/subscriptions`, `/purchase-invoices*` · IT Admin → Finance | DEMO-9/10; lọc hóa đơn theo trạng thái | M |
| 21 | [mới] `catalog.retirement` | Một ứng dụng cũ không còn ghế được ngừng (ví dụ "Skype for Business"), tạo ở bước 4 và **không có thuê bao đang chạy** | `POST /applications/{id}/retire` · IT Admin | Lọc ứng dụng đã ngừng | S |
| 22 | Tài liệu | README fixture (bảng phòng/người/danh mục/Request), `docs/guides/seed.md` (thời gian), FE `demo/accounts.md`, `demo/scenarios.md` (mục mới), sửa chữ "phòng gốc" (§2) | — | — | S |

Tổng: **22 bước** (12 sửa/mở rộng, 10 mới). Gộp được thành **5 đợt kiểm tra (checkpoint)**:

- **Đợt 1** (bước 1–9): tổ chức và danh mục; cần reset.
- **Đợt 2** (10–13): Request và nhân sự.
- **Đợt 3** (14–15): usage và SBF-20.
- **Đợt 4** (16–19): thiết bị và AI.
- **Đợt 5** (20–22): hợp đồng, hóa đơn, tài liệu.

Mỗi đợt nghiệm thu bằng:

- `pnpm exec jest src/cli/seed`;
- seed trên DB trống ra exit 0, chạy lại cùng ngày ra exit 2;
- script đăng nhập từng vai gọi các route của màn tương ứng và đếm số dòng.

Owner chạy hoặc cho phép chạy (theo `feedback_no_test_runs_without_asking`).

### 4.3 Ca phụ thuộc ngày và đồng hồ

- **D0 = ngày seed, demo thường ở D0+1.** Mọi ngày mới phải tính tương đối (`dayOffset(ctx.today, …)`), không dùng ngày tuyệt đối.
- **DEMO-14:** điều chỉnh ngân sách chỉ ghi được từ D0+1 (kỳ Y khóa sau hạn nộp = D0). Phải chạy `--continue` vào ngày demo.
- **SBF-20:**
  - Gói **tháng** neo theo grid ngày 31/12 nên chỉ vào cửa sổ từ ngày 23 tới cuối tháng (với tham số 7 ngày). Demo rơi ngày 18 thì không gói tháng nào trong cửa sổ, demo ngày 25 thì cả 7+ gói tháng cùng vào cửa sổ và sinh nhiều thông báo. Muốn ổn định nên neo `renewalDate` gói tháng theo `D0` (ví dụ `D0+5`, kiểm grid "sau ngày bắt đầu"); chỗ này cần Owner chốt (Q5).
  - Gói năm: báo động đỏ từ `deadline − 7`. `KEPT` chỉ đúng **ngày deadline** của gói tháng. `AUTO_RENEWAL_INCIDENT`/`EXPIRY_MARKED` do **job theo giờ** ghi, nhìn lại tối đa 60 ngày, không có ngay khi seed xong.
- **MF-5:**
  - Khuyến nghị chỉ vào hàng chờ trưởng phòng sau lượt đầu của job, khoảng 6 phút sau khi API khởi động. Bước quyết định ở bước 14 phải chờ như `ghost.decisions`.
  - Cửa sổ usage kết thúc "hôm qua"; quá 1 ngày sau là nguồn bắt đầu cũ dần.
- **MF-2/MF-3:**
  - Ngày cuối của NV-ITA4 là ngày làm việc thứ 3, chỉ trừ cuối tuần.
  - Điều chuyển hiệu lực tối thiểu ngày mai. Nhân viên mới được xếp phòng **từ hôm nay**, nên không điều chuyển được trong ngày seed.
  - Nghỉ đột ngột mới (bước 13) phải đặt cho người **không** có Request đang mở cần cho kịch bản khác.
- **NL-1:** seat-tháng chỉ tính từ ngày seed, nên ngưỡng 80/100 % của tháng đã qua không có.
- **Thiết bị:** `DEVICE_STOP_REQUEST_OVERDUE` chỉ có sau hạn xử lý, không có ở D0/D0+1.
- **Seed lại ≤ 1 ngày trước demo**, vẫn như cũ.

---

## 5. Điểm cần Owner chốt

- **Q1 — Super Admin/phòng khởi đầu.** A: giữ `ADMIN`, chỉ sửa chữ "phòng gốc" và giải thích cho FE (khuyến nghị). B: đổi phòng khởi đầu thành ITO, phải reset.
- **Q2 — Reset hay chỉ `--continue`.** Ghế nền mới (bước 8) chỉ có khi reset DB, vì baseline đã đóng. Có cho reset VPS demo không? Hay giữ một `fixture id` mới (`shared-demo-v5`) theo nguyên tắc ở `seed-steps.ts:65` ("a new version of the data is a new entry")?
- **Q3 — Quy mô danh mục.** Đồng ý khoảng 25 ứng dụng / 32 gói / 25 thuê bao với các nhà cung cấp có tên thật (Microsoft, Google, Adobe…), hay dùng tên hư cấu?
- **Q4 — AI trong demo.** Seed có bật sẵn `AI_ENABLED` và tóm tắt hàng chờ (chế độ `SIMULATED`) không? Mặc định hiện tại là tắt.
- **Q5 — Neo ngày gói tháng.** Đổi `renewalDate` gói tháng theo `D0` để luôn có thuê bao trong cửa sổ SBF-20 vào ngày demo, hay giữ grid 31/12 hiện tại?
- **Q6 — Collector/thiết bị (bước 17).** Làm trọn (token thiết bị, batch AI usage) hay chỉ bước 16 và 18 (đăng ký, xác nhận đọc, yêu cầu dừng)?
- **Q7 — Log `/tmp/seed-final.log` khối thứ hai.** Lỗi 500 `POST /budget-attachments/{id}/complete` là lượt cũ hay lượt mới? Nếu mới thì cần điều tra trước khi mở rộng seed.

---

## Owner chốt 17/11 ~18:15

| Câu | Chốt |
| --- | ---- |
| Q1 | **A**: giữ Super Admin ở phòng `ADMIN`, không đổi code. Thêm giải thích trong tài liệu FE: phòng riêng của Super Admin không có trưởng phòng, IT Admin hay Cost Center là bình thường (FR-8.7, QĐ-87f(1)). |
| Q2 | **Reset VPS demo khi deploy.** Seed mở rộng chạy trên DB trống, giữ tên fixture `shared-demo-v4`. |
| Q3 | Dùng **tên SaaS thật**. Giá là giá mô phỏng bằng VND, ghi rõ trong tài liệu. |
| Q4 | Seed **bật sẵn AI ở chế độ `SIMULATED`** và tạo vài lần gọi mẫu. Owner tự đổi sang `MODEL` khi Modal sẵn sàng. |
| Q5 | **Ngày gia hạn neo theo ngày chạy seed**, để luôn có thuê bao tháng/năm trong và ngoài cửa sổ điều chỉnh. |
| Q6 | Collector **làm trọn như tool thật**: token thiết bị, xác nhận, nhiều ngày usage AI gửi qua API thiết bị, yêu cầu dừng. |
| Q7 | Khối lỗi 500 thứ hai trong `/tmp/seed-final.log` là **lượt cũ còn sót**. Lượt seed trước khi máy khởi động lại vẫn chạy, ghi chung file log, rồi lỗi vì DB bị xóa và tạo lại ngay dưới nó. Lượt mới ghi `budget.next-year` thành công (dòng 32), exit 0. |
