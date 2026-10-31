# Spec: sửa tiếp checkpoint G0–G4 theo review Prompt 28

- Phụ trách: AI theo giao việc Owner (Prompt 29, 23/10/2026).
- Thiết kế ban đầu bởi: Owner (Prompt 29) trên báo cáo review độc lập Prompt 28 (`NOT READY`, 23/10/2026).
- Thiết kế: `draft`. Owner review: chưa review. Owner chọn `P29-MIGRATION=B-FORWARD` ngày 23/10/2026 (câu hỏi duy nhất của
  Prompt 29, sau khi Owner báo một VPS thử nghiệm đã áp migration cũ) — đó là quyết định đầu vào, không phải review hay
  nghiệm thu. Owner review Prompt 29 (24/10/2026) giao Prompt 29A sửa trong cùng hạng mục: `P29-RV-01` (disposition
  `P28-01` mô tả quá mức) và ba đường 500 `P29-N1` → `P29-N3`; Owner review Prompt 29A giao Prompt 29B (24/10/2026) đóng
  ma trận lỗi parser còn lại (`P29-N4`); Owner review Prompt 29B giao Prompt 29C (24/10/2026) đóng đua hoàn tất tệp
  (`P29-N5`); Owner review Prompt 29C giao Prompt 29D (24/10/2026) đóng ca mốc hết hạn (`P29-N7`), test `pg-pool` I1
  (`P29-N6`) và dọn dẹp suite sau setup dở (`P29-N8`); chấp nhận ngoại lệ `PRE_MIGRATION_READERS` (khi gate chứng minh
  đủ bốn điều) và quy tắc siết registry collection — đều là đầu vào, chưa phải nghiệm thu.
- Nguồn: Docs `a0764d2` (BRD v3.53, `QĐ-86` — `Company` là gốc tổ chức, không phải Cost Center; tài khoản dịch vụ thuộc
  đúng một phòng, chi phí về `Unit` của phòng đó), BE `2bb130c` (`dev` = `origin/dev`, PR #16 = `4cc9a47` + `7920ee5`).
  Báo cáo Prompt 28 không nằm trong repo: Owner giữ bản gốc (finding `P28-01` → `P28-18`); bản tóm tắt ở
  `BE-WORKSTREAM-TRACKER.md` ngoài repo.
- Nhóm roadmap: xuyên G2–G4 — hạng mục là `technical-enabler` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này checkpoint G0–G4 nâng cấp được các lịch sử CSDL **được hỗ trợ** — CSDL mới, CSDL đã áp migration cũ với
checksum gốc (VPS thử nghiệm), CSDL cũ mà preflight cho `READY` — về cùng một trạng thái (Cost Center chỉ `Unit`, tài khoản
dịch vụ thuộc phòng của người chịu trách nhiệm **vào ngày ghi nhận**) mà không sửa migration đã áp; CSDL cũ mà preflight chặn
(exit `2`) **không có đường nâng cấp tự động**: giữ nguyên byte/dữ liệu, deploy dừng trước migration, chờ quyết định riêng cho
đúng CSDL đó (`P29-RV-01`); gate integration không còn đỏ ngẫu nhiên vì thứ tự
audit hay đồng hồ; các đường ghi tỷ giá, khóa bản quyền và tệp hợp đồng đúng dưới đồng thời; bằng chứng test và khai báo
OpenAPI nói đúng điều code làm; ba lỗi client không còn trả 500 (thân JSON quá giới hạn ⟹ 413, tệp multipart sai tên trường ⟹
400, tên nhà cung cấp thuộc nhóm từ điển khác ⟹ 422, kẻ thua đua nhóm từ điển ⟹ 409 mã riêng) — kiểm bằng test integration
trên lịch sử migration thật, test HTTP thật, test đua khóa tất định và gate.

## Sizing decision

- Container: bó finding `P28-01` → `P28-18` của review Prompt 28 (23/10/2026) trên checkpoint `2bb130c`.
- Mode: `technical-enabler`.
- Outcome and owner: checkpoint G0–G4 an toàn để G5/G6 dựa vào; chạm các capability đã sở hữu finding: `installation`
  (preflight), `organization/employee`, `finance/exchange-rate`, `licensing/license-key`, `licensing/provisioning`,
  `catalog/contract`, `catalog/subscription`, gate `src/*.spec.ts`, `test/**`, migration mới, Compose, deploy workflow.
- Boundaries: hai migration mới (không sửa migration đã merge); lệnh vận hành chỉ đọc mới; transaction của ba đường ghi;
  khai báo OpenAPI đã có route; không route mới, không đổi quyền.
- Not larger: `P28-05` (chính sách đổi email công việc) thuộc G6 và `P28-09` (AC-17) thuộc G5 — chỉ ghi merge requirement;
  `P28-14`, phần rộng của `P28-15`, phần Unicode/xoay khóa của `P28-16` là backlog; không bắt đầu Prompt 26/27, H7.
- Not smaller: cùng mục tiêu _checkpoint làm nền được cho G5/G6_; tách theo finding để lại gate đỏ hoặc CSDL kẹt giữa chừng.
- Siblings: `g2-g4-unit-only-cost-attribution`, `g2-employee-official-field-maintenance`,
  `finance-reporting-currency-integrity`, `catalog-licensing-write-integrity`, `contract-document-upload-integrity`,
  `secret-and-upload-hardening`, `licensing-provisioning-task-read-contracts`, `licensing-assignment-read-contracts`,
  `catalog-subscription-read-model`, `api-list-detail-contract-remediation`, `delivery-gate-hardening`.
- Scope map: n/a

## Size exception

- Cohesion: mọi finding là lỗi hoặc bằng chứng sai của **một** checkpoint đã merge, cùng gate cuối (`pnpm check`, e2e,
  integration hai lần, migration lịch sử thật, OpenAPI).
- Why not split: Owner giao một gói fix-forward duy nhất (Prompt 29) để G5/G6 có một nền; tách ra để lại CI đỏ ngẫu nhiên
  hoặc migration chưa hội tụ cho các gói sau.
- Checkpoints: Phase A (migration + `INV-07`), B (CI tất định), C (transaction), D (bằng chứng, contract, runtime local) —
  mỗi phase có checkpoint trong [plan](plan.md).
- Maximum scope: `P28-01` → `P28-18` trừ phần ghi ở `## Explicit out of scope`; Prompt 29A thêm `P29-RV-01`, `P29-N1` →
  `P29-N3`, Prompt 29B thêm `P29-N4`, Prompt 29C thêm `P29-N5`, Prompt 29D thêm `P29-N6` → `P29-N8` (cùng checkpoint, cùng
  gate cuối — không phải hạng mục mới).
- Accepted by: Owner giao việc qua Prompt 29 (23/10/2026); chưa review kết quả.

## Primary Story/AC

| Story | AC                                      | Coverage | Phần còn lại thuộc                                                                                  |
| ----- | --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| —     | `P28-01`, `P28-04`                      | n/a      | gỡ chặn `g4-request-and-transfer-integration`, `g2-downstream-integration` (Cost Center chỉ `Unit`) |
| —     | `P28-02`, `P28-13`, `P28-18`            | n/a      | gỡ chặn remote CI của mọi PR, trước hết `g4-request-and-transfer-integration`                       |
| —     | `P28-03`, `P28-10`, `P28-11`            | n/a      | gỡ chặn `g3-downstream-finance-integration`, `g4-device-dependent-features`                         |
| —     | `P28-06` → `P28-08`, `P28-12`, `P28-17` | n/a      | gỡ chặn Prompt 26 và `api-list-detail-contract-remediation` (`LD-13`)                               |
| —     | `P29-RV-01`, `P29-N1` → `P29-N3`        | n/a      | gỡ chặn Owner commit checkpoint (Prompt 29A); FE/Mobile sinh lại client (413, mã 409 mới)           |
| —     | `P29-N5`                                | n/a      | gỡ chặn Owner commit checkpoint (Prompt 29C); contract không đổi                                    |
| —     | `P29-N4`                                | n/a      | gỡ chặn Owner commit checkpoint (Prompt 29B); FE/Mobile sinh lại client (400/415 của parser)        |

`P28-05` và `P28-09` không sửa ở đây: merge requirement của G6/G5 (mục _Explicit out of scope_).

## Supporting references

- Báo cáo Prompt 28 (Owner giữ), [review hậu merge](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md),
  [database rules](../../../rules/database-business.md) (`DB-05`, `DB-15`, `DB-16`),
  [operational commands](../../../rules/operational-commands.md).
- Hành vi ứng dụng làm chuẩn cho chủ sở hữu tài khoản dịch vụ: `seat-baseline-import.service.ts` (phòng của người chịu
  trách nhiệm vào `recordedOn`).

## Explicit out of scope

- **`P28-05` → G6 (merge requirement):** khi đổi email công việc trong lúc có lời mời/đặt lại mật khẩu/khôi phục đang hiệu
  lực, Owner phải chọn _chặn đổi_ hay _luồng giữ người nhận bất biến_; địa chỉ mới không bao giờ âm thầm nhận một credential
  đã phát. File sở hữu: `organization/employee/employee-maintenance.service.ts`,
  `identity-access/recovery/successor-enrolment.service.ts`, `identity-access/accounts/*invitation*`; test chấp nhận: đổi
  email khi lời mời đang mở ⟹ đúng hành vi Owner chọn, lời mời cũ không tới địa chỉ mới (integration, HTTP + SQL).
- **`P28-09` → G5 (merge requirement):** AC-17 của `US-02-02` (hộp thông báo) phải có trước khi revision này lên
  `main`/production; tới lúc đó contract hiển thị _chưa đủ_ và production phải **fail closed** bằng guard kỹ thuật (không
  chỉ tài liệu). File sở hữu: `organization/employee/employee-intake*`, module thông báo của G5; test chấp nhận: khởi động
  production khi AC-17 chưa có ⟹ từ chối hoặc route nhập hồ sơ trả lỗi có mã; khi AC-17 có ⟹ thông báo được ghi cùng
  transaction.
- Backlog có tên: `P28-14` (quota reveal theo ngày làm việc VN, `Retry-After`, `DELETE` quét bảng), phần rộng `P28-15`
  (email trả về đã lưu, SoD-5 trong transaction, dự án thứ 21 cho trưởng phòng, ngừng Cost Center khi còn tài khoản dịch
  vụ, mắt xích bàn giao khác phòng), `P28-16` phần Unicode (U+00AD, U+2060–2064) và ghi chú phát hành khóa base64url.
- Prompt 26, Prompt 27, H7 (`DB-04`), G5, G6.

## Dependencies and blockers

Đã gỡ: Owner chọn `B-FORWARD` (23/10/2026). Không blocker kỹ thuật. Remote CI chỉ ghi được sau khi Owner commit/push.

## Ownership: module, data, API

- Migration mới `20261023100000_service_account_owner_on_recorded_day`, `20261023110000_time_limited_staff_open_assignment_end`;
  migration `20261022120000_cost_centers_unit_only` giữ nguyên từng byte (sha256 `115efb61…`).
- Lệnh mới `pnpm ops:preflight` (`src/migration-preflight-cli.ts`, `installation/migration-preflight/`): chỉ đọc, phiên
  `default_transaction_read_only=on`; đăng ký trong `module-graph`, `operational-commands`, `architecture-boundaries`
  (ngoại lệ `PRE_MIGRATION_READERS` có lý do, chỉ SELECT — **điểm Owner cần review**).
- Không route HTTP mới; OpenAPI đổi khai báo/mô tả và một mã trạng thái (`P28-12`).
- Prompt 29A: giới hạn thân request một chỗ `src/infrastructure/http/request-body-limit.ts` (đăng ký trong `app/configure-application.ts`),
  helper OpenAPI 413 `openapi-request-body-limit.ts`, nhận diện lỗi parser `filters/request-parser-errors.ts` (gọi từ
  `HttpExceptionFilter`); lỗi có type của capability `catalog/vendor` (`vendor.errors.ts`), ánh xạ ở
  `catalog-entry/application.service.ts` và `application.http-errors.ts` — `vendor.errors.ts` **đăng ký thành contract nội
  module** (`INTRA_MODULE_CONTRACTS`, GATE.2) vì đó là hai lỗi `vendor-directory.service.ts` (contract sẵn có) ném ra và
  capability `catalog-entry` phải bắt bằng `instanceof`, như `accounts/account.errors.ts`; không phải mục legacy ledger; mã mới `APPLICATION.DICTIONARY_GROUP_CHANGED`
  (409). Gate `PRE_MIGRATION_READERS` siết (tệp chính xác, phân tích SQL, khả năng với tới chỉ từ lệnh preflight).
- Prompt 29B: ma trận parser trong `filters/request-parser-errors.ts`, không ghi khi client đã đi trong `HttpExceptionFilter`,
  giới hạn URL-encoded trong `request-body-limit.ts`, helper OpenAPI 400/413/415 `openapi-request-parser.ts` (thay
  `openapi-request-body-limit.ts` của 29A).

## Behavior and design

### Phase A — lịch sử migration hội tụ (`P28-01`) và `INV-07` hai phía (`P28-04`)

- **Quy tắc:** chủ sở hữu tài khoản dịch vụ là phòng của người chịu trách nhiệm vào **ngày ghi nhận** — `valid_from` khi
  tệp không có ngày cấp (`RECORDED`), ngược lại là ngày ghi dòng theo lịch của tổ chức (`created_at AT TIME ZONE
time_zone`); cùng biểu thức ở preflight và migration tiến.
- **Ba lịch sử:** CSDL mới (không gì để đổi); CSDL cũ chưa chạy `20261022120000` mà preflight cho `READY` (migration cũ
  sở hữu theo ngày bắt đầu, migration tiến sửa về ngày ghi nhận); CSDL đã chạy migration cũ với checksum gốc (VPS thử
  nghiệm) — migration tiến sửa về ngày ghi nhận. Ba lịch sử cho cùng kết quả (test so trực tiếp).
- **Migration tiến:** câu lệnh đầu dừng **trước khi ghi** nếu một tài khoản dịch vụ không có phòng vào ngày ghi nhận (mã
  dòng trong thông báo); rồi ghi một Audit Trail `LICENSE_ASSIGNMENT.OWNER_CORRECTED` (actor `SYSTEM`, trước/sau) cho mỗi
  dòng đổi; rồi tắt trigger bất biến **cho đúng một câu lệnh** cập nhật `owning_department_id`, `cost_center_id` và bật
  lại — như backfill của migration cũ. Không dùng `migrate resolve`, không sửa `_prisma_migrations`.
- **Preflight (`pnpm ops:preflight [--json]`):** đọc `_prisma_migrations` và dữ liệu theo schema hiện có; trạng thái
  `NOT_INSTALLED`, `BEFORE_UNIT_ONLY`, `UNIT_ONLY_FAILED`, `UNIT_ONLY_APPLIED`, `FORWARD_FAILED`, `CONVERGED`; mã thoát 0
  sẵn sàng, 2 bị chặn, 1 lỗi. Liệt kê dòng sẽ sửa và Cost Center `COMPANY` sẽ bị xóa. Chặn:
  `SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START` (migration cũ sẽ dừng — import nhân sự xếp phòng từ ngày import),
  `SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY`, `COST_ALLOCATION_NAMES_COMPANY` (lịch sử phân bổ bất biến không có
  `Unit` tất định theo `QĐ-86`), `DEPARTMENT_CHARGED_TO_COMPANY`, `MIGRATION_FAILED`. Workflow deploy chạy preflight sau sao
  lưu, trước `migrate deploy`; khác 0 ⟹ dừng.
- **Không hoàn tác được (`DB-05`):** migration cũ xóa cứng Cost Center `COMPANY` (kể cả `INACTIVE`), thu hẹp enum, ghi đè
  `cost_center_id` không audit — chỉ bản sao lưu trước deploy giữ lại; migration tiến ghi đè `owning_department_id`/
  `cost_center_id` có audit trước/sau. Ngoại lệ trước phát hành của `DB-15`: **không dùng** — migration đã merge giữ nguyên.
- **Quyết định dữ liệu còn mở:** CSDL cũ chưa nâng cấp mà có dòng bị chặn chỉ đi tiếp khi Owner chọn tạo lại CSDL (hoặc
  có căn cứ HR cho phòng của ngày bắt đầu, ghi ngoài lệnh này); ứng dụng không có thao tác ghi lùi lịch sử phòng/phân bổ
  và gói này không phát minh thao tác đó.
- **Disposition chính xác (`P29-RV-01`, Prompt 29A, 24/10/2026)** — thay cách nói _`P28-01` đã sửa_: `P28-01` **đóng cho các
  lịch sử đã biết/được hỗ trợ, fail-closed với quyết định riêng cho từng CSDL cũ bị chặn**. `ops:preflight` là phép kiểm chỉ
  đọc, **không** phải công cụ sửa. Chính sách:
  - VPS thử nghiệm đã áp migration cũ ⟹ đường hỗ trợ là migration tiến `20261023100000`;
  - CSDL mới và CSDL cũ qua preflight (`READY`) ⟹ đường hỗ trợ, có test;
  - CSDL cũ bị preflight chặn (exit `2`) ⟹ giữ nguyên byte/dữ liệu, deploy dừng **trước** migration;
  - không lệnh nào được phát minh phòng/`Unit`, âm thầm viết lại lịch sử bất biến hay tạo lại CSDL;
  - CSDL bị chặn chỉ được tạo lại sau khi Owner **xác nhận riêng đúng CSDL đó** là bỏ được;
  - CSDL bị chặn không bỏ được cần quyết định ánh xạ từng dòng có căn cứ thẩm quyền **và** một quy trình sửa được review
    riêng — gói này không bịa ánh xạ đó.

  Giới hạn này không chặn commit checkpoint fail-safe, nhưng chặn deploy lên mọi CSDL có preflight exit `2`. Bảng lịch sử ở
  [containers](../../../guides/containers.md#preflight-before-migrate-deploy-p28-01).

- **`INV-07` từ phía nhân sự:** trigger `employees_time_limited_open_assignments_have_end` từ chối đổi loại nhân sự sang
  CONTRACTOR/FREELANCER/INTERN khi còn Assignment mở (chưa kết thúc, chưa thất bại) thiếu ngày kết thúc dự kiến; quy tắc
  Assignment đọc loại nhân sự với dòng `FOR SHARE` nên hai phía xếp hàng ở cả hai thứ tự. `PATCH /employees/{id}` trả 422
  `EMPLOYEE.ROW_INVALID` lý do `OPEN_ASSIGNMENT_NEEDS_EXPECTED_END`, không audit.

### Phase B — CI tất định (`P28-02`, `P28-13`, `P28-18`)

- Không test nào suy thứ tự nhân quả từ `ORDER BY occurred_at, id` (mili giây + UUID ngẫu nhiên): bốn assertion so cặp sự
  kiện cùng transaction đổi sang so tập hoặc chọn theo action/resource/correlation; một test tái hiện thứ tự id.
- Thời gian trôi của tác vụ và cửa sổ quota đọc `Date.now()` (seam tối thiểu ở quota), test đặt thời điểm; bài toán quyền
  vai e2e dựng một ứng dụng thay vì ba; helper migration báo rõ _quá thời hạn_ hay _Prisma lỗi_ và tắt kiểm tra cập nhật
  của Prisma CLI (`CHECKPOINT_DISABLE=1`) — nguyên nhân đã đo của deploy treo quá 60 s; import khóa ghi một câu lệnh.
- `document-http.integration-spec.ts`: LF, byte NUL thành `\u0000` (cùng chuỗi).

### Phase C — transaction (`P28-03`, `P28-10`, `P28-11`)

- Tỷ giá: đọc tổ chức `FOR SHARE` trong transaction ghi; kiểm, audit, response cùng tiền tệ báo cáo đó.
- Import khóa: giữ thuê bao `FOR UPDATE` + gói `FOR SHARE` (`lockSeatTarget`), kiểm K4 lại dưới khóa; một `INSERT` cho cả
  lô theo thứ tự fingerprint.
- Hoàn tất tệp: chép bản đã xem → ghi CSDL → **chỉ sau commit** mới xóa bản upload; commit lỗi ⟹ rút bản chép trừ khi
  dòng đã trỏ tới nó (commit mất trả lời), đọc không được ⟹ giữ cả hai (thừa một object, không mất tệp).

### Phase D — bằng chứng, contract, runtime local

Chi tiết từng finding và kết quả ở [plan](plan.md).

### Phase E — Prompt 29A: ba đường 500 và hai quy tắc được chấp nhận

- **`P29-N1` thân JSON quá giới hạn:** một giới hạn 100 KiB (`REQUEST_BODY_LIMIT_BYTES`, bằng mặc định Express trước đây — không
  đổi con số) cho thân JSON và URL-encoded, đăng ký trước khi Nest gắn parser mặc định (Nest bỏ qua parser cùng tên đã có).
  Filter nhận **đúng chữ ký** lỗi raw-body (`instanceof Error`, `type = 'entity.too.large'` — cách body-parser hướng dẫn phân
  biệt lỗi của nó —, `status = statusCode = 413`, `expose`, `limit` số; không so tên lỗi, theo
  [module-structure](../../../rules/module-structure.md)) ⟹ 413 `HTTP_PAYLOAD_TOO_LARGE`, envelope thường, không thông điệp parser/stack/mảnh thân. Object chỉ
  mang `status: 413` vẫn 500; các lỗi body-parser khác (charset 415, …) Prompt 29A để 500 — **đã đóng ở Prompt 29B, Phase F**.
  OpenAPI: mọi operation có thân JSON (63) khai 413 qua
  một helper (`withRequestBodyLimitResponse`; Prompt 29B đổi thành `withRequestParserResponses` trong
  `openapi-request-parser.ts`, khai cả 400 và 415), không chép mô tả vào controller.
- **`P29-N2` multipart sai tên trường:** multer 2 viết `Unexpected file field` còn bảng của Nest khớp `Unexpected field`, nên
  lỗi lọt thành 500; ba mã mới của multer 2 (`LIMIT_FIELD_NESTING`, `LIMIT_FIELD_ARRAY_INDEX`, `INVALID_FIELD_NAME`) chưa có
  trong bảng. Filter nhận lỗi bằng `instanceof` **chính lớp `MulterError` mà `FileInterceptor` của Nest nạp** (multer là
  dependency của `@nestjs/platform-express`, không của dự án — resolve từ đó, không thêm dependency; unit test so đúng lớp đó),
  rồi theo **mã**: `LIMIT_FILE_SIZE` ⟹ 413, mười mã client khác ⟹ 400
  `HTTP_BAD_REQUEST`; `STREAM_DESTROYED`, mã lạ, lỗi lưu trữ vẫn 500. Thiếu tệp vẫn là lỗi miền của handler (422
  `IMPORT.FILE_REQUIRED`, `SEAT_BASELINE_IMPORT.FILE_REQUIRED`); giới hạn upload và khai 400/413 giữ nguyên.
- **`P29-N3` nhà cung cấp/nhóm từ điển:** `VendorDirectoryService.ensureForDictionaryGroup` thôi ném `Error` thô: tên chuẩn hóa
  đã thuộc **nhóm khác** ⟹ `VendorNameHeldByAnotherGroupError` (tất định) ⟹ 422 `APPLICATION.DICTIONARY_LINE_MISMATCH` như
  mismatch thường, không ghi ứng dụng/nhà cung cấp/audit; thua đua (nhóm bị nhà cung cấp khác lấy giữa lúc đọc và ghi, hay
  tên không còn) ⟹ `VendorDictionaryGroupChangedError` ⟹ 409 **`APPLICATION.DICTIONARY_GROUP_CHANGED`** bảo client làm mới rồi
  gửi lại. Kẻ thua đua `DB-03` của PATCH (Prompt 29 dùng chung mã 422) nay cũng mang mã này: một mã chỉ đi với một status.
  Ngữ nghĩa 422 mismatch và 409 `APPLICATION.DICTIONARY_LINE_TAKEN` không đổi.
- **Chấp nhận `PRE_MIGRATION_READERS`** chỉ khi gate chứng minh: tệp chính xác (không wildcard); SQL chỉ `$queryRaw` mở đầu
  `SELECT`/`WITH` và mảnh `Prisma.sql`, không từ khóa ghi, không `$executeRaw`/`*Unsafe`/delegate ghi; phiên chỉ đọc; chỉ
  `migration-preflight-cli.ts` với tới qua import (không API/worker/bootstrap/lệnh khác). Thêm câu ghi, reader hay đường gọi ⟹
  gate đỏ (đột biến chứng minh).
- **Chấp nhận quy tắc registry collection:** sự kiện `unbounded → bounded` có `maxItems` nguyên dương và nguồn chính xác là
  siết kỹ thuật, không cần quyết định Owner mới; đổi hình dạng response, mặc định, cắt bớt hay phân trang vẫn cần contract
  nghiệp vụ sở hữu.

### Phase F — Prompt 29B: ma trận lỗi parser (`P29-N4`)

Đọc mã nguồn body-parser 2.3.0 / raw-body 3.0.2 đã cài và **đo tại filter** (probe e2e tạm, đã xóa) trước khi sửa. Nhận theo
`type` đã tài liệu hóa **cùng** status/statusCode và thuộc tính mà nơi tạo luôn gán (`expose`, `instanceof Error`); không bao giờ
chỉ theo `status`, tên hay thông điệp. Bảng ở [API contract](../../../rules/api-contract.md#errors):

- 400 `HTTP_BAD_REQUEST`: `entity.parse.failed` (URL-encoded; JSON hỏng là `SyntaxError` mà Nest tự đổi thành
  `BadRequestException` **trước** filter — đã 400 trước 29B, đo được), `request.size.invalid` (Node từ chối
  `Content-Length` + `Transfer-Encoding` ở tầng HTTP trước app — chỉ unit), `request.aborted`, `querystring.parse.rangeError`;
  và **thân nén hỏng**: body-parser bọc lỗi zlib/brotli thành status 400 **không có `type`** — đo được `Z_DATA_ERROR` (gzip,
  deflate), `Z_BUF_ERROR` (gzip cắt ngắn), `ERR__ERROR_FORMAT_PADDING_2` (br) — nhận theo đúng hình dạng đó (`errno` số, mã dữ
  liệu; `Z_MEM_ERROR` và mã cấp phát vẫn 500).
- 413 `HTTP_PAYLOAD_TOO_LARGE`: `entity.too.large` (29A), `parameters.too.many`.
- 415 `HTTP_UNSUPPORTED_MEDIA_TYPE`: `charset.unsupported` (JSON ngoài UTF, URL-encoded ngoài UTF-8/ISO-8859-1, charset không
  tồn tại), `encoding.unsupported`.
- 500 giữ nguyên: `stream.encoding.set`, `stream.not.readable`, type lạ, `entity.verify.failed` (không có verify hook — không có
  contract), mã multer lạ, lỗi lưu trữ.
- **Client đã đi** (`request.aborted`): socket đã hủy nhưng `res.destroyed`/`headersSent` vẫn `false` (đo được) ⟹ filter vẫn phân
  loại (không log lỗi bất ngờ) nhưng **không ghi** khi `headersSent`, `writableEnded`, `destroyed` hay `socket.destroyed`.
- **Giới hạn URL-encoded ghi rõ** (`request-body-limit.ts`): tối đa 100 tham số (`URLENCODED_PARAMETER_LIMIT`) và độ sâu lồng 5
  (`URLENCODED_DEPTH_LIMIT`) thay mặc định thư viện 1 000/32; parser vẫn gắn như mặc định của Nest dù không route nào khai
  URL-encoded; OpenAPI không quảng bá URL-encoded.
- **OpenAPI:** mọi operation có thân JSON (63) khai 400, 413, 415 của parser qua `withRequestParserResponses`; 400 riêng của
  `authResetPassword`, `authRedeemInvitation` được giữ, nghĩa của parser nối sau đúng một lần.

**`P29-N5` (mới, Prompt 29B, lúc đó chưa sửa — đã đóng ở Prompt 29C, xem dưới):** hai lần hoàn tất cùng một tệp cùng lúc — kẻ thua đọc dòng chưa khóa còn
`AWAITING_UPLOAD`, rồi thấy upload đã bị kẻ thắng xóa ⟹ 409 `DOCUMENT.UPLOAD_PENDING` (sai nghĩa: tệp đã hoàn tất) thay
`DOCUMENT.NOT_AWAITING_UPLOAD`; test `document-complete-commit` đua bằng `Promise.all` không rào nên chập chờn (1 đỏ trong lượt 68
suite của 29B, 8/8 xanh khi chạy riêng). Mã `document.service.ts` thuộc sửa lưu trữ Prompt 29 (`P28-11`) phải giữ nguyên byte
trong 29B ⟹ cần Owner giao một lát sửa (đọc lại dưới khóa trước khi kết luận, test đua có rào).

### Phase G — Prompt 29C: đua hoàn tất tệp (`P29-N5`)

**Prompt 29C (24/10/2026) — đóng `P29-N5`, test-first, tất định:** lúc chỉ có **một** câu trả lời sai: bước `head` trước
transaction thấy upload vắng thì trả ngay `UPLOAD_PENDING`. Mọi nhánh khác của kẻ thua (đọc byte đầu, chép, chờ khóa dòng) đã
được kiểm trạng thái dưới khóa dòng hòa giải thành `NOT_AWAITING_UPLOAD` và rút bản chép của nó. Sửa trong
`document.service.ts`: upload vắng ⟹ đọc lại dòng (vẫn qua kiểm tra chủ sở hữu) — không còn `AWAITING_UPLOAD` ⟹ 409
`DOCUMENT.NOT_AWAITING_UPLOAD`, còn ⟹ 409 `DOCUMENT.UPLOAD_PENDING`. Đúng vì upload chỉ bị xóa **sau** commit của kẻ thắng. Không
giữ transaction/khóa dòng qua lời gọi kho; không đổi route, schema, mã, thông điệp, quyền, migration, Prisma, khóa object hay
lifecycle; OpenAPI trùng byte. Bằng chứng: năm thứ tự ép bằng lời gọi kho bị giữ (`beforeCall` của kho giả) hoặc khóa dòng bị
giữ, không sleep — xem plan, Phase G.

- **Contract ổn định:** đúng một lời gọi 200 `DOCUMENT.UPLOADED`; mọi kẻ thua đồng thời 409 `DOCUMENT.NOT_AWAITING_UPLOAD`;
  upload thật sự chưa tới mà dòng còn `AWAITING_UPLOAD` ⟹ 409 `DOCUMENT.UPLOAD_PENDING`; đúng một object giữ lại và một sự kiện
  `DOCUMENT.UPLOADED`; upload chỉ xóa sau commit thắng; commit thắng lỗi giữ upload, rút bản chép, gọi lại được.
- **Thứ tự chứng minh:** (1) kẻ thua bị giữ ở `head`, `readPrefix` hoặc `copyIfMatch` tới khi kẻ thắng commit và xóa upload;
  (2) cả hai chép xong rồi kẻ thua chờ khóa dòng do kết nối thứ ba giữ; (3) upload bị xóa hoặc đặt lại giữa `head` →
  `readPrefix` → `copyIfMatch` khi dòng còn chờ ⟹ 422 `DOCUMENT.UPLOAD_MISMATCH`, `QUARANTINED`, không giữ gì (giữ nguyên ngữ
  nghĩa cũ); (4) commit lỗi rồi gọi lại; (5) upload chưa bao giờ tới. Bài đua `Promise.all` cũ giữ lại làm bằng chứng phụ.
- **Ghi nhận, không sửa (Low) — _Owner đánh lại Medium `P29-N7`, đóng ở Prompt 29D, Phase H_:** nhánh hết hạn (`expire` trả `false` vì dòng đã đổi) vẫn trả `UPLOAD_EXPIRED` — chỉ với tới khi
  kẻ thắng hoàn tất trước mốc 24 giờ và kẻ thua vượt mốc ngay sau đó; ngoài phạm vi 29C.

**`P29-N6` (Low, có sẵn, lúc đó không sửa — đã đóng ở Prompt 29D, Phase H):** lượt integration đầy đủ đầu tiên của 29C đỏ một test không liên quan, `pg-pool` I1
(`Query read timeout`, hạn client 1 s) khi máy đang tải nặng; tệp đó không đổi từ `2eda0f1`, chạy riêng 6/6 xanh, lượt đầy đủ
thứ hai xanh. Test phụ thuộc đồng hồ thật nên có thể đỏ trên runner chậm — chờ Owner xếp lịch.

### Phase H — Prompt 29D: mốc hết hạn, `pg-pool` I1, dọn dẹp sau setup dở

**Prompt 29D (24/10/2026, sau Owner review Prompt 29C) — ba finding, test-first:**

- **`P29-N7` (Medium — Owner đánh lại từ ghi chú Low của 29C):** kẻ thua đọc `AWAITING_UPLOAD` ngay trước mốc 24 giờ, kẻ thắng
  commit, kẻ thua vượt mốc rồi gọi `expire` — `expire` trả `false` (dòng đã khóa không còn chờ) nhưng `complete` bỏ qua kết quả
  và vẫn trả 409 `UPLOAD_EXPIRED`. Sửa trong `document.service.ts`: dùng kết quả của `expire`; `false` ⟹ đọc lại dòng (vẫn qua
  kiểm tra chủ sở hữu) — đã hết hạn ⟹ `UPLOAD_EXPIRED`, xong ⟹ `NOT_AWAITING_UPLOAD`. Cùng một hàm đọc lại phục vụ nhánh upload
  vắng của 29C (thêm: dòng đã hết hạn ⟹ `UPLOAD_EXPIRED` thay vì `NOT_AWAITING_UPLOAD`). Hai hàm nhận diện câu trả lời của kho
  (`isStorageObjectChanged`, `isStorageObjectMissing`) chuyển sang `contract.policy.ts` để `document.service.ts` ở 399 dòng (trần
  400, không thêm ledger). Không đổi chính sách 24 giờ, route, schema, mã, thông điệp, quyền, khóa object, lifecycle, Prisma,
  migration; không khóa qua lời gọi kho; OpenAPI trùng byte bản 29C.
- **`P29-N6` (đóng — nguyên nhân ở harness):** cả hai lần đỏ đều ở truy vấn đầu tiên **sau** khi thả kết nối bị giữ (29C lần 1:
  `Query read timeout`; tái hiện dưới tải 20 tiến trình bận: `Connection terminated due to connection timeout`). Trong I1 kết nối
  nạn nhân là kết nối duy nhất, nên truy vấn đó luôn phải mở **backend mới** — nằm trong chính cửa sổ timeout 1 s/5 s mà test
  đang khiêu khích; việc gỡ nạn nhân khỏi pool lại không đồng bộ (vết đo: `remove` xảy ra trong truy vấn sau). Sửa test (không đổi
  mã production, không tăng `QUERY_TIMEOUT_MS`): mở và trả **hai** kết nối trước khi giữ; **chờ sự kiện `remove`** của nạn nhân;
  khẳng định mọi truy vấn sau chạy trên kết nối đã mở sẵn — không phải nạn nhân, không phải backend mới; giữ nguyên chứng minh
  rollback, retire đúng một lần, không ghi dở.
- **`P29-N8` (Low — harness):** suite hoàn tất tệp chạy không có `TEST_DATABASE_ADMIN_URL` báo lỗi setup **kèm** 11 `TypeError`
  từ `afterEach` (kết nối giữ khóa chưa mở). Nay kết nối chỉ được gán khi đã mở, dọn dẹp bỏ qua đúng tài nguyên chưa có, vẫn dọn
  tài nguyên đã có; lỗi setup gốc giữ nguyên, suite vẫn đỏ (không bỏ qua) khi thiếu CSDL riêng.
- **Đính chính 29C:** báo cáo 29C nói checkpoint sẵn sàng trong khi khoảng hở hợp đồng Medium `P29-N7` còn đó — không đúng; chỉ
  29D mới khép.

Bằng chứng: plan, Phase H.

## Test matrix

| AC / rủi ro | Tình huống                                                                                                                                                                       | Cấp test                                                                         | Kết quả mong đợi                                                                                                                                   | Bằng chứng sau implement |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `P28-01`    | CSDL mới; CSDL cũ READY (A, B); CSDL cũ bị chặn (C, D, phân bổ `COMPANY`); deploy bỏ qua preflight; CSDL đã chạy migration cũ (A, B) và (D)                                      | integration lịch sử thật (`unit-only-upgrade-history`)                           | hội tụ cùng trạng thái, audit sửa, drift sạch; chặn trước khi ghi, mã dòng                                                                         | xem plan                 |
| `P28-04`    | PATCH ba loại; đã có ngày kết thúc/đã kết thúc; SQL trực tiếp; đua hai thứ tự                                                                                                    | integration (`employee-kind-of-staff-assignment-end`)                            | 422 không audit; 23514; chờ khóa rồi bị từ chối                                                                                                    | xem plan                 |
| `P28-02`    | hai sự kiện cùng mili giây                                                                                                                                                       | integration (`audit`) + 4 suite sửa                                              | thứ tự theo id, assertion không phụ thuộc                                                                                                          | xem plan                 |
| `P28-13`    | đọc list/detail cách 2,5 s; mở khóa qua ranh phút UTC                                                                                                                            | integration                                                                      | 10/12 giây; cửa sổ phút mới                                                                                                                        | xem plan                 |
| `P28-03`    | đổi tiền tệ đang chạy; dòng bị giữ                                                                                                                                               | integration (`exchange-rate-reporting-currency-race`)                            | chờ rồi ghi/trả USD; chờ rồi 422                                                                                                                   | xem plan                 |
| `P28-10`    | đổi loại trước/import trước; 3 và 30 khóa                                                                                                                                        | integration (`license-key-import-plan-race`)                                     | 422 không khóa nào; đổi loại bị từ chối; số câu lệnh bằng nhau                                                                                     | xem plan                 |
| `P28-11`    | commit lỗi rồi gọi lại; hai lần gọi cùng lúc                                                                                                                                     | integration (`document-complete-commit`)                                         | giữ upload, rút bản chép, gọi lại 200; một bản giữ                                                                                                 | xem plan                 |
| `P29-N1`    | thân JSON đúng 100 KiB; thêm một byte trên route công khai, đăng nhập, route có bảo vệ; lỗi giả `status: 413`                                                                    | e2e HTTP (`app`) + unit filter + OpenAPI inventory                               | 201; 413 `HTTP_PAYLOAD_TOO_LARGE` không lộ gì; 500; 63 operation khai 413                                                                          | xem plan                 |
| `P29-N2`    | tệp dưới tên trường khác trên hai route upload; form không có tệp; mười mã multer, mã lạ, `STREAM_DESTROYED`, lỗi lưu trữ                                                        | e2e HTTP (hai route) + unit filter                                               | 400 không nêu trường/tệp; 422 `FILE_REQUIRED`; 400/413; 500                                                                                        | xem plan                 |
| `P29-N7`    | kẻ thua giữ sau khi đọc (đồng hồ đặt qua mốc sau khi kẻ thắng commit); lời gọi qua mốc hết hạn trước một lần hoàn tất bị giữ ở `head`; hai lời gọi qua mốc                       | integration (`document-complete-commit`, `Date.now` đặt, đọc bị giữ)             | 409 `NOT_AWAITING_UPLOAD`, `expire` = false, không sự kiện hết hạn, object giữ nguyên; 409 `UPLOAD_EXPIRED` ×2, một sự kiện, upload xóa sau commit | xem plan                 |
| `P29-N6`    | nạn nhân hết thời gian, thả, truy vấn sau                                                                                                                                        | integration (`pg-pool` I1, sự kiện `remove`)                                     | không truy vấn sau nào trên nạn nhân hay backend mới; retire 1                                                                                     | xem plan                 |
| `P29-N5`    | kẻ thua giữ ở `head`/`readPrefix`/`copyIfMatch` sau khi kẻ thắng xóa upload; cả hai chép rồi chờ khóa; upload xóa/đặt lại giữa các bước; commit lỗi rồi gọi lại; upload chưa tới | integration (`document-complete-commit`, kho giả có `beforeCall`, khóa dòng giữ) | 200 + 409 `NOT_AWAITING_UPLOAD`, một object, một sự kiện; 422 quarantine; 500 rồi 200; 409 `UPLOAD_PENDING`                                        | xem plan                 |
| `P29-N4`    | JSON hỏng/charset/encoding/nén hỏng; URL-encoded 101 tham số, lồng 6, charset; đúng biên 100/5; client bỏ đi giữa thân; ma trận đơn vị đủ hàng + phủ định                        | e2e HTTP (`app`, socket thô) + unit filter + OpenAPI inventory                   | 400/413/415 không lộ gì; 422 ở biên; không ghi lên socket đã đóng; 500 cho phủ định                                                                | xem plan                 |
| `P29-N3`    | khai ứng dụng từ dòng có nhóm trùng tên nhà cung cấp đã giữ nhóm khác; đua tạo với nhà cung cấp khác lấy nhóm; đua PATCH hai nhóm                                                | integration (`catalog-licensing-write-integrity`)                                | 422 mismatch, không ghi gì; 409 `DICTIONARY_GROUP_CHANGED`, một người thắng                                                                        | xem plan                 |

## Definition of Done

- [ ] Mọi finding sửa ở đây có test đỏ-trước/xanh-sau và chứng minh đột biến; finding giao G5/G6 có merge requirement.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; e2e + OpenAPI; integration hai lần.
- [ ] Spec/plan/roadmap/review/tracker phản ánh implementation cuối; contract đổi đã ghi cho FE/Mobile.
- [ ] Không tăng legacy ledger; ngoại lệ `PRE_MIGRATION_READERS` ghi rõ để Owner review.
- [ ] Runbook deploy và hướng dẫn container đã cập nhật; phần chưa kiểm chứng (remote CI, VPS thật) ghi rõ.

## Changes and acceptance

23–24/10/2026 — thiết kế và triển khai theo Prompt 29, `verified` local (bằng chứng ở [plan](plan.md#verification-and-handoff)); chưa Owner review, chưa commit, remote CI chưa có.

24/10/2026 — Prompt 29D (sau Owner review Prompt 29C): đóng `P29-N7` (Medium), `P29-N6`, `P29-N8`; `verified` local (bằng
chứng ở [plan](plan.md#verification-and-handoff)). Chưa commit, remote CI chưa có, chưa nghiệm thu.

24/10/2026 — Prompt 29C (sau Owner review Prompt 29B): đóng `P29-N5` — kẻ thua đồng thời luôn 409
`NOT_AWAITING_UPLOAD` nhờ đọc lại dòng khi upload vắng; năm thứ tự ép tất định; `verified` local (bằng chứng ở
[plan](plan.md#verification-and-handoff)). Chưa commit, remote CI chưa có, chưa nghiệm thu.

24/10/2026 — Prompt 29B (sau Owner review Prompt 29A): đóng `P29-N4` — ma trận lỗi parser đang với tới được, client đã đi
không bị ghi, giới hạn URL-encoded ghi rõ, OpenAPI 400/413/415 cho thân JSON; `verified` local (bằng chứng ở
[plan](plan.md#verification-and-handoff)). Chưa commit, remote CI chưa có, chưa nghiệm thu.

24/10/2026 — Prompt 29A (sau Owner review Prompt 29): sửa disposition `P28-01` (`P29-RV-01` — phép kiểm chỉ đọc, không phải
sửa; CSDL bị chặn fail-closed), đóng `P29-N1` → `P29-N3` test-first, siết gate `PRE_MIGRATION_READERS`; `verified` local trên
cây làm việc cuối (bằng chứng ở [plan](plan.md#verification-and-handoff)). Chưa commit, remote CI chưa có, chưa nghiệm thu.
