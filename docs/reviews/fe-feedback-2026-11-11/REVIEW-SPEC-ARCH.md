# REVIEW — kiến trúc và khả thi của ba bộ SPEC/PLAN (12/11/2026)

> **Phạm vi:** đọc-only, đối chiếu với code BE `feat/mf2-mf3` = `b71ed330` (working tree chỉ đổi tài liệu review). Ba bộ:
> [bug-fix v1.1](../be-bugfix-2026-11-12/SPEC.md) (BF), [MF-2/MF-3 v2.2](../mf2-mf3-2026-11-10/SPEC.md) (MF), [feedback FE v2](SPEC.md) (FE).
> Trục: đặt module/tầng, trích dẫn `file:line`, dữ liệu/migration, API, job, PLAN. Không chạy test (chỉ đọc code, migration, gate).
> **Skill đã dùng:** `code-review-and-quality` (5 trục, phân mức), `deprecation-and-migration` (expand–contract, xóa route),
> `verification-before-completion` (mọi kết luận có bằng chứng `file:line` hoặc lệnh đã chạy).

## 0. Tóm tắt

| Mức     | Số  | Mã                                                                                                        |
| ------- | --- | --------------------------------------------------------------------------------------------------------- |
| Blocker | 3   | BLK-1 snapshot giá/ADR-0007 · BLK-2 chuyển `SERVICE`→`PERSONAL` · BLK-3 giải phóng cam kết hai lần (MF-3) |
| Major   | 13  | MAJ-1 … MAJ-13                                                                                            |
| Minor   | 15  | MIN-1 … MIN-15                                                                                            |

Kết luận: đặt module/tầng nhìn chung **đúng** (mọi cạnh mới đi xuống tầng hoặc qua cạnh cùng tầng có sẵn; `policies` ở T3 khả thi —
xem MAJ-3/Cần Owner). Rủi ro thật nằm ở **ràng buộc CSDL hiện có mà SPEC không thấy** (BLK-1, BLK-2, MAJ-5, MAJ-7), **cơ chế tiền** (BLK-3,
MAJ-10) và **gate chỉ chạy ở cuối chuỗi** (MAJ-1/2/3/11) — chat code sẽ chỉ thấy đỏ sau ~80 task. 64 trích dẫn đã kiểm: 55 OK, 9 WRONG (§4).

## 1. Blocker

**BLK-1 — FE FX-1/FX-2, D2, §6 "`price_rate*`, `price_reporting_*` thôi ghi".**
Bằng chứng: `prisma/migrations/20261020150000_catalog_subscriptions/migration.sql:51-57` (`subscriptions_snapshot_whole`: snapshot đủ hoặc
vắng) và `:74-80` (`subscriptions_active_complete`: thuê bao `ACTIVE` ⟹ `price_rate IS NOT NULL`); trigger
`subscriptions_price_in_reporting_currency` (`20261022100000_reporting_currency_integrity/migration.sql:70-87`);
`docs/decisions/0007-money-representation.md:12,35` (Accepted: mọi tiền mang số gốc + tỷ giá + số quy đổi, BRD `ADR-03`).
Vấn đề: thôi ghi snapshot ⟹ mọi lần tạo/kích hoạt thuê bao `ACTIVE` bị 23514; muốn qua thì phải nới CHECK — tức sửa một ADR đã Accepted
mà SPEC không nêu. Migration một lần FX-1.1 cũng phải ghi snapshot cho dòng đã đổi sang VND.
Sửa: giữ ghi **snapshot đồng nhất** cho VND (`price_rate = 1`, `price_rate_source = 'SAME_CURRENCY'` — giá trị enum có sẵn,
`price_reporting_minor = unit_price_minor`, `price_reporting_currency = 'VND'`, `price_rate_date = price_recorded_on`), cả ở code lẫn
FX-1.1; chỉ bỏ các trường đó khỏi response. Thêm task "ADR-0007 amendment" (hoặc ADR mới thay một phần) vào FX-2; làm tròn theo
ADR-0007 dòng 18 (nửa ra xa 0), không "làm tròn tới đồng" chung chung.

**BLK-2 — MF X-SA.1 (§6 dòng `license_assignments`), "chuyển `SERVICE` còn hiệu lực ⟹ `PERSONAL` của IT Admin".**
Bằng chứng: trigger `license_assignments_immutable` cấm đổi `kind`, `employee_id`, `cost_center_id`, `owning_department_id`, `reason`…
(`20261109130000_request_pricing_one_amount/migration.sql:78-88`); CHECK `license_assignments_personal_has_no_cost_center`
(`20261020190100_licensing_assignments/migration.sql:48`) trong khi dòng `SERVICE` luôn có Cost Center (`:45-46`); ràng buộc loại trừ
`:93-101` vẫn áp khi `UPDATE` chạy trước khi thay ràng buộc.
Vấn đề: SPEC/PLAN mô tả một `UPDATE` đơn giản — migration sẽ đỏ ngay ở trigger, và nếu IT Admin đã có seat cá nhân cùng thuê bao thì đỏ
ở EXCLUDE. Ngoài ra dòng `SERVICE` còn được `provisioning_tasks`, `service_account_duty_notices`, `handover_duties` trỏ tới.
Sửa (một migration, thứ tự cố định): (1) thêm cột; (2) `DROP CONSTRAINT` cũ + `ADD` bản `WHERE kind='PERSONAL' AND NOT is_machine_account`;
(3) chọn **một** cơ chế và ghi vào SPEC — khuyến nghị **kết thúc dòng `SERVICE`** (`valid_until` = ngày triển khai, cột được phép đổi) +
**chèn dòng `PERSONAL` mới** (`is_machine_account = true`, `cost_center_id NULL`, giữ `owning_department_id`, `account_identifier`,
`reason` ⟹ `machine_account_note`), giữ lịch sử bất biến; nếu buộc sửa tại chỗ thì theo tiền lệ `DISABLE TRIGGER` của
`20261023100000_service_account_owner_on_recorded_day/migration.sql:76-85` kèm sự kiện Audit; (4) khối `DO $$ … RAISE` đếm trước/sau.
Tách X-SA.1 thành hai task (ràng buộc + chuyển dữ liệu) và nêu số tác vụ/duty mở của dòng `SERVICE` trong HANDOFF.

**BLK-3 — MF MF3-B.2 / MF3-C.1, bất biến "cam kết quyền cũ giải phóng đúng một lần".**
Bằng chứng: `requests/grant/seat-release.service.ts:35-45` (`afterRevocation` tự giải phóng lý do `REVOKED` khi **mọi** tác vụ thu hồi
hoàn tất); `requests/grant/seat-release.policy.ts:101` (số giải phóng chỉ bị chặn bởi `heldMinor`); `RevocationTaskFacts`
(`licensing/public/licensing.types.ts:375-383`) không mang nguồn thu hồi.
Vấn đề: MF3-B giải phóng phần còn lại từ ngày hiệu lực (`TRANSFER_EFFECTIVE`); khi tác vụ nguồn `TRANSFER` hoàn tất ở MF3-C,
`afterRevocation` lại giải phóng "các tháng sau ngày kết thúc", bị chặn bởi phần còn giữ ⟹ trả nốt cả phần **đã dùng** trước ngày hiệu
lực (giải phóng thừa). PLAN MF3-C.1 không chạm file nào của `requests/grant/`.
Sửa: (a) thêm `sources: RevocationSource[]` vào `RevocationTaskFacts`; `afterRevocation` bỏ qua khi có `TRANSFER`; (b) MF3-B tính số
bằng chính `revocationShare({ endsOn: ngày hiệu lực − 1 })` trên `lockSeatCommitments` (dùng `seat_monthly_minor` đã lưu, không tra giá
hiện hành), `reference = transfer:<id>:assignment:<id>`; (c) test bất biến: điều chuyển → hoàn tất thu hồi → tổng giải phóng = đúng
phần từ ngày hiệu lực; mutation bỏ điều kiện (a) phải đỏ.

## 2. Major

**MAJ-1 — Cả ba PLAN §0: quick check không có `pnpm test:gates`, không có checkpoint giữa chuỗi.** `package.json` `check` gồm
`test:gates`, còn `arch:check` chỉ là dependency-cruiser. Các gate sẽ đỏ muộn: trần 25 file (`test/gates/module-layout.gate-spec.ts:26`,
tính cả spec — `docs/rules/module-structure.md:61`), sở hữu bảng `PRISMA_MODEL_OWNER` (`architecture-boundaries.gate-spec.ts:32` — mọi
bảng mới DS/PI/RC/RV/AD/CO/PL phải thêm, chỉ PL-1.1 có nêu), `api-collection-contract`, `extension-wiring`, `module-graph` (R10),
`migration-order`. `docs/rules/work-item-sizing.md:156-158`: plan nhiều phase ghi checkpoint "gate chạy sau mỗi phase". Sửa: cuối **mỗi
gói** chạy `pnpm test:gates`, `pnpm rules:check`, `pnpm prisma:validate` (nhanh, không phải full suite); task thêm thư mục/bảng/extension
point/collection chạy `pnpm test:gates` ngay.

**MAJ-2 — Trần 25 file/thư mục bị vượt ở chỗ PLAN đặt file mới.** `personnel/offboarding/` = 25 file (đầy) nhưng MF2-D.1 (policy+spec),
MF2-D.2 (job+service), MF2-E.1 (job+service), MF2-G.1 (job) đặt vào đó ⟹ ≥ 6 file thừa. `personnel/transfer/` 20 file + MF3-B.3 (controller
`me`), MF3-C.1 (job+service), MF3-C.3 (listener), RD.3 (service) ⟹ 25–26. `identity-access/accounts/` 23 + B4 (controller, service, dto)
⟹ 26. `licensing/assignment/` 23 + X-SA.2 (service, policy, spec) ⟹ 26 (X-SA.3 xóa sau, quá muộn). Sửa: ghi sẵn capability mới —
`personnel/departure-deadline/` (hạn + quá hạn + sweeper mốc chặn + tự đóng), `personnel/transfer-grace/` (ân hạn, `me`, sweeper, hook
P10), `identity-access/it-admin-directory/` (B4), `licensing/machine-account/` (P13).

**MAJ-3 — Facade đã đủ 8 phụ thuộc; `licensing/public/` đã 25 file.** `eslint.config.mjs:57` `max-params` 8 (ADR-0019:35 "mỗi facade ≤ 8
phụ thuộc"); `LicensingApi` 8 và `CatalogApi` 8 (`catalog/public/catalog.api.ts:44-51`). DS.4 (`addDepartmentSoftwareFromCatalogLink`) và
X-IT.2 (`transferResponsibilities`) cần service mới ⟹ tham số thứ 9 ⟹ lint đỏ. Sửa: facade mới `catalog/public/catalog-responsibility.api.ts`
(thư mục còn chỗ) và `licensing/public/licensing-department-tools.api.ts`; giải phóng chỗ ở `licensing/public/` bằng cách xóa
`licensing-service-account.api.ts/.types.ts` ở X-SA.3 và `licensing-handover.api.ts/.types.ts` ở X-H.3 (sau khi dời `OperatorAuditActor`).

**MAJ-4 — Giá trị enum mới dùng trong cùng migration.** Repo tách "`_values`" vì "A value of an enum cannot be used in the transaction that
adds it" (`20261110020100_licensing_extend_task_values/migration.sql:2`, 16 migration như vậy). Ảnh hưởng: `RevocationSource.TRANSFER`
(X0.3) + CHECK/trigger dùng nó, `CommitmentReleaseReason.TRANSFER_EFFECTIVE` (MF3-B.2; còn phải thêm vào union TS
`budgets/public/budgets.types.ts:79-86`), change kind mới (X0), lý do hủy/`RULE_CHANGED` (X-H.4, X-SA.1 nếu là enum),
`BASELINE_NO_PROPOSAL` (BG-2.4), giá trị trả về của `ApprovalDecision` (`prisma/models/requests.prisma:116`, PL-2). Sửa: quy ước trong PLAN
§2 "mỗi giá trị enum ở migration `…_values` riêng, đứng trước migration/backfill dùng nó"; ghi DB-05 (không hoàn tác) vào HANDOFF.

**MAJ-5 — MF X0.5/X0.6 căn cứ một ô: CHECK hiện có và phạm vi thật.** `20261024170000_personnel_employee_leaves/migration.sql:62-68`:
`employee_leave_changes_grounds_whole_check` (cả bốn cột cùng NULL/không NULL) và `employee_leave_changes_kind_check` (`STARTED` ⟹
`grounds_type IS NOT NULL`) sẽ chặn ghi nghỉ dài chỉ có `groundsNote`. Schema dùng chung ở ~31 file (`leave`, `notice`, `offboarding`,
`transfer`, `super-admin-event` = đường BM-09/CLI, `personnel/public/personnel.extension-points.ts:79`), trong khi X0.6 đòi "notice giữ form
cũ". Sửa: X0.5 thay hai CHECK (bản mới: `grounds_reference` bắt buộc, ba cột kia NULL hoặc đủ); tách `groundsNoteBodySchema` mới, giữ
`groundsBodySchema` cho notice; tách X0.6 theo luồng (leave / offboarding / transfer / BM-09), mỗi task một luồng.

**MAJ-6 — BF §2.1/B5–B7: gỡ Business Owner thiếu phạm vi.** Thực tế 53 file `src` (không spec, không `generated`) chứ không 29. Thiếu
trong bảng §2.1: `personnel/transfer/transfer.service.ts:38` + `transfer.dto.ts:101` + `transfer.types.ts:99`
(`BUSINESS_OWNER_KEEP_OR_CHANGE` trong response `POST /department-transfers`), `catalog/plan/plan.repo.ts:143-183,271-277`,
`plan-facts.service.ts:83`, `CatalogApi.getApplicationsOwnedBy/getPlanBusinessOwnerId/registerInternalSoftware`
(`catalog.api.ts:79,198,206-212`, gọi từ `requests/assessment/internal-registration.service.ts:62`), mã `APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER`.
Task B7 trỏ `offboarding-view.service.ts` nhưng số đếm ở `offboarding/detail/offboarding-detail.service.ts:69,94`. Sửa: bổ sung bảng §2.1 và
tách task B7 (subscription-renewal 8 file / personnel 6 file / catalog facade 3 file).

**MAJ-7 — FE CT-1: "bỏ ô `comm*`, thôi ghi" và `functional_group_id SET NOT NULL`.** `20261020120000_catalog_applications/migration.sql:48-64`:
bốn cột `comm*`/`is_communication_service` `NOT NULL` không default + CHECK `is_communication_service = (a OR b OR c)` ⟹ `INSERT` không
ghi sẽ đỏ. `CatalogApi.registerInternalSoftware` (`catalog.api.ts:206-212`) không nhận nhóm ⟹ `SET NOT NULL` (CT-1.5) làm gãy case B nội
bộ cho tới IN-1. Sửa: CT-1.1 `ALTER … SET DEFAULT false` cho bốn cột; CT-1.4 liệt kê **mọi** đường tạo ứng dụng (`POST /applications`,
`internal-software-registration`, `registerInternalSoftware`, seed) và đặt nhóm (`OTHER` mặc định) trước CT-1.5.

**MAJ-8 — FE XY-1: `nextYearBudget` trả cho "mọi tài khoản" qua `POST /access-requests/preview`.** `requests/request-submission/request-preview.dto.ts:15,88`
ghi rõ preview "Never a budget figure". Đưa `approved/remaining` của ngân sách năm sau cho mọi nhân viên là lộ số liệu ngân sách phòng.
Sửa: chỉ `GET /access-requests/{id}/spend-approval`, `GET /spend-approvals` (SPENDING_APPROVER, FINANCE) trả `nextYearBudget`; preview chỉ
trả `cost.nextYear` (xem Cần Owner #3).

**MAJ-9 — FE FX: phạm vi ảnh hưởng tính sai.** `FinanceApi.snapshotMoney` có **5** lời gọi ở 3 file
(`catalog/subscription/subscription-pricing.service.ts` ×2, `requests/spend/budget-check.service.ts`, `year-start-commitments-batch.service.ts` ×2),
không phải 16; FX-2.3 liệt kê `budgets/version/line-import.service.ts`, `subscription-renewal-view.service.ts`, `installation/public/installation.api.ts`
nhưng chúng chỉ gọi `findCurrency`/`parseMoney` (vẫn cần). Ngược lại thiếu: `RATE_MISSING` còn ở `access-request.types.ts:192`,
`access-request-record.mapper.ts:173`, `access-request.dto.ts:216`, `spend-decision.policy.ts:36`, `access-request-query.service.ts:40` và được
**lưu** ở `access_requests.one_step_blocked_reason` ⟹ dòng cũ phải đọc được (giữ giá trị như "retired", không ghi mới). Thiếu điều kiện tiên
quyết: migration FX-1.1 `RAISE` nếu có tổ chức `reporting_currency <> 'VND'`. `src/core/money/rate.ts` còn được `catalog/subscription/*` dùng —
chỉ xóa khi BLK-1 chốt cách ghi snapshot. Sửa: viết lại danh sách file FX-2.1/2.3 theo grep trên.

**MAJ-10 — FE BG-2/AD-1/RV-2: khóa đồng thời cho tổng nhiều Cost Center.** Khóa hiện có là theo **một** Cost Center + năm
(`budgets/budget/budget-year-lock.repo.ts:1-18`, thứ tự: request → version → khóa năm). "Tổng (cơ sở + dự phòng) mọi Cost Center ≤ Trần −
dự phòng kho" (BG-2.3), `SUPPLEMENT/CEILING_REDUCTION ≤ phần chưa phân bổ`, `TRANSFER` hai Cost Center (AD-1) đều là ràng buộc toàn kỳ ⟹ hai
giao dịch song song cùng qua kiểm. Sửa: khóa dòng `budget_cycles` (`FOR UPDATE`) **trước** mọi khóa năm; `TRANSFER` khóa hai Cost Center theo
id tăng dần; `budget_threshold_alerts` có unique `(cost_center_id, year, threshold, base_minor)` để RV-2 "một lần mỗi lần vượt" không trùng.
Ghi thứ tự khóa mới vào comment của `BudgetYearLockRepo`.

**MAJ-11 — Ba SPEC: hợp đồng collection `API-LIST-DETAIL.1` (`docs/rules/api-contract.md:72-100`).** ~20 collection mới (`GET /it-admins`,
`/departments/{id}/software-list`, `/me/department-software-list`, `/department-software-proposals`, `/reports/revocation-sla` `rows[]`,
`/usage-overview`, `/usage-imports`, `/assessment-decisions`, `/purchase-invoices`(+`missing-periods`), `/invoice-discrepancies`,
`/vendor-account-discrepancies`, `/out-of-process-cases`, `/budget-review-periods`, `/budget-adjustments`, `/policies`(+versions,
acknowledgements), `/devices/{id}/registrations`, `/stock-summary`) và mảng lồng (P7 `oldRights[]`, P23 `rightsToRevoke[]`…, P19
`vendorAdmins[]`, P25 `items[]`) — chỉ `GET /contracts` có nêu phân trang. Gate `api-collection-contract` sẽ đỏ ở cuối. Sửa: thêm quyết định
chung (FE D9 / MF §4): `page/pageSize` (max 100) hoặc business maximum có nguồn, `maxItems` cho mảng lồng, summary ≠ detail, test đếm câu lệnh.

**MAJ-12 — FE PF-1.4: xóa ảnh (object storage) trong giao dịch `LEFT` của `personnel`.** `docs/rules/database-business.md:92-93` (gọi network
sau commit); `docs/rules/security-jobs.md:53` (chỉ API mount object storage), trong khi `personnel` chạy cả trong graph CLI BM-09
`RecordSuperAdminEventCliModule` (`test/support/process-graphs.ts`). Sửa: trong tx chỉ xóa cột (`avatar_object_key` chuyển sang hàng đợi
`avatar_purges` hoặc cờ); sweeper API xóa object sau commit, idempotent.

**MAJ-13 — MF P24/X-IT.7: `SUBSCRIPTION_SEATS_INCREASED` gắn vào `addPoolSeat`.** `catalog/public/catalog.api.ts:128-135`: hàm này tăng
`purchased_quantity` cả khi "the seat a K1 grant buys for its holder" ⟹ **mỗi lần cấp `K1`** sinh thông báo cho IT phụ trách (trừ khi chính họ
cấp). S13 nói "mua thêm khi kho hết". Sửa: chỉ phát khi gói `K2`/`K4` (kho) tăng; `K1` không báo (Cần Owner #4).

## 3. Minor

- **MIN-1 (MF MF3-C.1):** idempotent "theo `transfer_id + assignment_id`" không có cột; dùng index có sẵn
  `provisioning_tasks_one_live_revocation_per_assignment` (`20261024080000_licensing_revocation_tasks/migration.sql:78`) + lý do thu hồi `referenceKind/referenceId`
  (`licensing.types.ts:386-392`). Seat đã có tác vụ thu hồi sống (ghost seat, hết hạn) ⟹ bỏ qua, ghi HANDOFF, không 23505.
- **MIN-2 (MF MF3-C.3):** extension point "đang ân hạn" nên là `Contributions` (0..n, như `PendingSpendContributions`), không `Hook`: `WorkerModule`
  nạp `RequestsWorkFacadeModule` (`src/worker/worker.module.ts:10`) mà không nạp `personnel` ⟹ `Hook` chưa bind trong graph đó làm gate `extension-wiring` đỏ.
- **MIN-3 (MF P13):** tắt cờ máy khi IT Admin còn seat cá nhân cùng thuê bao ⟹ 23P01 từ EXCLUDE; ánh xạ 409
  `LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_OVERLAP`. Không có đường tạo seat máy mới khi đã có seat cá nhân (cấp bị EXCLUDE chặn trước khi bật cờ) — ghi rõ là chủ ý.
- **MIN-4 (MF DS.1):** unique "phòng + ứng dụng + gói" với `plan_id` nullable cần `UNIQUE NULLS NOT DISTINCT` (PG 17); "một đề xuất mở" cần partial
  unique `WHERE state = 'PENDING'`, không check-then-insert (`database-business.md` mục Transaction).
- **MIN-5 (MF P20):** giới hạn 4 phòng là đếm-rồi-ghi; khóa dòng `employees` của IT Admin đích trong `department.service.ts`; áp cả đường BM-09/import nếu gán IT Admin.
- **MIN-6 (MF PLAN MF1-X.2):** đường dẫn sai `requests/reassignment/step-routing/one-step-conversion.policy.ts` ⟹ `requests/step-routing/one-step-conversion.policy.ts`.
- **MIN-7 (MF RD):** RD.2 chưa chọn module cho `/reports/revocation-sla` (không có module `reports`) ⟹ ghi `dashboards/revocation-sla/`. RD.3 tách "tính tác động"
  **sau** khi P1/P6 đã viết ⟹ refactor rủi ro; dựng service tác động thuần ngay ở MF2-B.1/MF3-A.2 rồi RD.3 chỉ thêm route.
- **MIN-8 (BF B7 vs MF X-IT.3):** offboarding có hai trường cùng nghĩa: `responsibleApplications` (BF) và `itHandover { subscriptions, applications }` (MF P3). Chọn một.
- **MIN-9 (BF B3, FE IN-1.3, FE US-1):** ngoài phạm vi lúc lọc danh sách ⟹ rỗng (BF, IN-1) nhưng `GET /usage-overview` ⟹ 404. Quy ước: lọc list ⟹ rỗng; id trên path ⟹ 404.
- **MIN-10 (FE PLAN):** task thêm thông báo (BG-1.2, PI-1.3/1.5, AD-1.2, RV-1.4, RV-3.1, PL-1.3, XY-1.3) không liệt kê `notifications/public/notifications.types.ts`
  và `notifications/inbox/inbox.policy.ts` (bảng mã/tham số đóng — `security-jobs.md` mục Storage and jobs).
- **MIN-11 (MF MF2-D.2, FE RV-1.4, RV-3.1, XY-1.3):** chưa nêu khóa chống trùng (`eventKey`/unique theo ngày) cho RV-1.4/RV-3.1; mọi sweeper mới
  phải vào danh sách sweeper API ở `docs/rules/security-jobs.md:69-149` (ADR-0018), chạy được nhiều instance.
- **MIN-12 (FE RQ-1.2, BF A1):** GH-3 còn ở `requests/renewal-request/renewal-request.dto.ts:25-29` (`manyPaidSoftwareReason`) — RQ-1.2 bỏ sót;
  A1 còn phải thêm ví dụ `KEY_DISPOSITION_REQUIRED` vào `provisioning.http-errors.ts:200-205`.
- **MIN-13 (BF §4 backfill):** Audit lưu `actor_app_user_id` (`prisma/models/audit.prisma:15`), phải join `app_users`; vị từ "IT Admin đang làm việc" trong SQL phải
  đúng như `findUsableItAdminEmployeeIds`. Route nhận phụ trách khi `NULL` cần khóa dòng `applications` (hai IT Admin cùng nhận).
- **MIN-14 (BF/FE):** "B6" vừa là bug hóa đơn (SPEC BF §2) vừa là task xóa route (PLAN BF §3); FE §2 viết "21 sau bug-fix B6" ⟹ đổi tên task thành `BO-DEL`.
- **MIN-15 (FE PI-1.4):** `invoice.repo.ts:156-173` `spentOf` `JOIN budget_commitments` (inner) theo năm cam kết; hóa đơn chỉ gắn thuê bao sẽ không
  vào thực chi Cost Center (đúng `QĐ-104c` nếu chủ ý) và năm phải lấy từ `service_month` (`COALESCE`). Ghi rõ trong PI-1.4.

## 4. Kiểm trích dẫn (64 mục)

| #   | Trích dẫn (SPEC)                                                                                     | Kết quả                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | BF `it-admin-dashboard.service.ts:80` `notAvailable('DEVICE_REGISTRY_NOT_DELIVERED')`                | OK                                                        |
| 2   | BF `registry-query.repo.ts:44` `STATE_SQL`                                                           | OK (hằng private, cần method repo mới)                    |
| 3   | BF `board-query.service.ts:128,196` `fullName`                                                       | OK                                                        |
| 4   | BF `board.dto.ts:109,221`                                                                            | OK                                                        |
| 5   | BF `board-query.service.ts:48` `getDepartmentIdsInChargeOf`                                          | OK                                                        |
| 6   | BF `it-admin-dashboard.service.ts:60` mẫu `getItAdminScope`                                          | OK                                                        |
| 7   | BF `revocation.policy.ts:143` `?? 'RETURN_TO_STORE'`                                                 | OK (thực tế dòng 141)                                     |
| 8   | BF `provisioning.dto.ts:62` `keyDisposition`                                                         | OK                                                        |
| 9   | BF `provisioning/*.http-errors.ts:137` `REVOCATION.<problem>`                                        | OK                                                        |
| 10  | BF `catalog.prisma` `Application.businessOwnerEmployeeId` dòng 137                                   | OK                                                        |
| 11  | BF `catalog-link.service.ts:48-50` `BUSINESS_OWNER_REQUIRED`                                         | OK                                                        |
| 12  | BF "code còn 29 file dùng" Business Owner                                                            | **WRONG** — 53 file `src` (MAJ-6)                         |
| 13  | BF `app-users.controller.ts:83` chỉ SUPER_ADMIN                                                      | OK                                                        |
| 14  | BF `identity-access.api.ts:144` `findAllUsableItAdminEmployeeIds`                                    | OK                                                        |
| 15  | BF `application.service.ts:253` `APPLICATION.CREATED`                                                | OK (audit lưu app user — MIN-13)                          |
| 16  | BF `catalog-entry/` 23 file + 1 thư mục                                                              | OK                                                        |
| 17  | BF PLAN B7 `offboarding-view.service.ts` đếm Business Owner                                          | **WRONG** — `detail/offboarding-detail.service.ts:69,94`  |
| 18  | BF `GET /it-admins` chưa có; `seed:local` có, `dev:seed` không                                       | OK                                                        |
| 19  | BF 5 route Business Owner (`routes.md`)                                                              | OK                                                        |
| 20  | MF `20261020190100_licensing_assignments/migration.sql:93-99` EXCLUDE `PERSONAL`                     | OK (93-101)                                               |
| 21  | MF `personnel-grounds.dto.ts` dùng chung leave/notice/offboarding/transfer                           | OK (thực tế ~31 file + BM-09)                             |
| 22  | MF `grounds_*` trên 5 bảng                                                                           | OK (bỏ sót 2 CHECK — MAJ-5)                               |
| 23  | MF `catalog/plan/plan.dto.ts:42-45` workspace profile                                                | OK                                                        |
| 24  | MF bảng `plan_workspace_profiles`, `plan_workspace_admins`                                           | OK                                                        |
| 25  | MF `licensing/handover/` 18 file                                                                     | OK                                                        |
| 26  | MF "tài khoản dịch vụ ~80 file"                                                                      | **WRONG** — 133 file `src` không spec                     |
| 27  | MF `src/core/working-days.ts` có sẵn                                                                 | OK                                                        |
| 28  | MF `TRANSFER_REVIEW_WORKING_DAYS` (`parameter-definitions.policy.ts:198`)                            | OK                                                        |
| 29  | MF/FE `licensing/provisioning/` đủ 25 file                                                           | OK                                                        |
| 30  | MF `licensing/public/seat-month-cost.policy.ts`, `requests/grant/seat-release.policy.ts`             | OK                                                        |
| 31  | MF `BudgetsApi.releaseForRequest` (`budgets.api.ts:50`)                                              | OK                                                        |
| 32  | MF `licensing/expiry/expiry-reminder.job.ts`                                                         | OK                                                        |
| 33  | MF `provisioning/tasks/provisioning-holder.service.ts`                                               | OK                                                        |
| 34  | MF `catalog.api.ts:128-135` tăng `purchased_quantity`                                                | OK (cũng chạy khi cấp K1 — MAJ-13)                        |
| 35  | MF `requests/reassignment/step-routing/one-step-conversion.policy.ts`                                | **WRONG** — `requests/step-routing/…` (MIN-6)             |
| 36  | MF `provisioning_tasks.due_on` có sẵn                                                                | OK                                                        |
| 37  | MF `LicensingApi.openRevocation` (`licensing.api.ts:57`)                                             | OK                                                        |
| 38  | MF route P9 (5), P12 (4), P15 (4) tồn tại                                                            | OK                                                        |
| 39  | MF file `offboarding-*`/`transfer-*` PLAN dẫn (preconditions, writer, endings, settlement, closure…) | OK                                                        |
| 40  | MF `GET /access-request-audit-flags`, `POST /offboarding-cases/{id}/account-lock`                    | OK                                                        |
| 41  | FE `exchange_rates`, `finance/exchange-rate/`, `reporting-currency.controller.ts`                    | OK                                                        |
| 42  | FE "`snapshotMoney` 16 nơi gọi"                                                                      | **WRONG** — 5 lời gọi/3 file (MAJ-9)                      |
| 43  | FE FX-2.3 ba file là nơi gọi `snapshotMoney`                                                         | **WRONG** — chỉ `findCurrency`/`parseMoney`               |
| 44  | FE `budget-check.service.ts` `RATE_MISSING`                                                          | OK (thiếu 5 nơi khác)                                     |
| 45  | FE `year-start-commitments.policy.ts` `NO_RATE`/`CURRENCY_MISMATCH`                                  | OK                                                        |
| 46  | FE `core/money/convert.ts` ngoại lệ R7 (`capability-graph.gate-spec.ts:296`)                         | OK                                                        |
| 47  | FE `access-request.dto.ts:9-24` `expectedEndDate`, `:29-31` APPROVE/REJECT                           | OK                                                        |
| 48  | FE `term-limit.ts` `TERM_LIMIT_MONTHS`, `effectiveEndOf`                                             | OK (dòng 11, 59)                                          |
| 49  | FE `provisioning-grant-writer.service.ts:211`                                                        | OK                                                        |
| 50  | FE `pricing.policy.ts:120-191`; `spend-approval.dto.ts:19,41`                                        | OK                                                        |
| 51  | FE `request-resubmission.service.ts:25`                                                              | OK (dòng 23)                                              |
| 52  | FE `expiry.policy.ts:4` `REMINDER_LEAD_DAYS = 7`; `renewal-request.dto.ts:19-33`                     | OK                                                        |
| 53  | FE `budget-invoices.controller.ts:26-37`; `invoice.repo.ts:156-173`                                  | OK                                                        |
| 54  | FE `cycle.policy.ts:83` `firstPublishedAt`; `baseline.policy.ts:169` `HAS_HEAD`                      | OK                                                        |
| 55  | FE `budgets.extension-points.ts:25` `PendingSpendContributions`                                      | OK                                                        |
| 56  | FE `budget_cycles.opened_at` NOT NULL; `BudgetVersion` base/reserve/`q1..q4`                         | OK                                                        |
| 57  | FE `Application` `comm*`, `data_sensitivity` NOT NULL; `Contract` chỉ `name`                         | OK (thiếu default/CHECK — MAJ-7)                          |
| 58  | FE `MonitoringNoticeVersion.requiresReacknowledgement`, `devices.last_accepted_at`, `exceljs`        | OK                                                        |
| 59  | FE đếm thư mục (budgets/budget 25, requests/spend 25, catalog/subscription 24+3, budgets/version 23) | OK                                                        |
| 60  | FE `requests/assessment/` 20 file, `catalog/contract/` 12 file                                       | OK                                                        |
| 61  | FE `GhostSeatGroup` G1–G4; `PUBLIC_ROOT_POLICY_FILES`; `licensing-pool-stock.api.ts`                 | OK                                                        |
| 62  | FE ~70 "File chính" của PLAN FE                                                                      | OK (đều tồn tại)                                          |
| 63  | FE "`price_rate*`, `price_reporting_*` thôi ghi" là khả thi                                          | **WRONG** — CHECK `subscriptions_active_complete` (BLK-1) |
| 64  | FE "`comm*` thôi ghi" là khả thi                                                                     | **WRONG** — NOT NULL không default (MAJ-7)                |

## 5. Chồng lấn giữa ba gói (cùng file, tuần tự — không xung đột nếu giữ thứ tự)

| File / điểm                                                          | Gói chạm                               | Lưu ý                                                   |
| -------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `dashboards/it-admin/it-admin-dashboard.service.ts`                  | BF A3 → MF RD.1 → FE PI-2.1            | RD.1 giữ khóa `offboardingHandovers` một bản            |
| `licensing/provisioning/revocation.policy.ts`, `provisioning.dto.ts` | BF A1 → MF K1-CL.2, MF2-D.3 → FE K1-GR | dto gần trần dòng; giữ một `k1Checklist` cho 3 biến thể |
| `requests/assessment/catalog-link.service.ts`, `assessment.dto.ts`   | BF B5 → FE FX-1.3, IN-1.1/1.2, PL-2.4  | 4 lần sửa một DTO                                       |
| `catalog/catalog-entry/application.service.ts`/`.dto.ts`             | BF B2 → FE CT-1.4                      | CT-1.4 viết lại hình body (một lệnh app+gói)            |
| `requests/request-limits/*`                                          | MF MF3-C.3 → FE RQ-1.1                 | RQ-1 phải giữ miễn trừ `QĐ-110q` của MF3-C.3            |
| `catalog/public/catalog.api.ts`, `licensing/public/licensing.api.ts` | MF X-IT.2/7, DS.4 → FE CT-1.6, PI-1.3  | trần 8 phụ thuộc (MAJ-3)                                |
| `personnel/offboarding/*.dto/mapper`                                 | BF B7 → MF X0.6, MF2-A/D, X-IT.3       | MIN-8                                                   |
| `devices/registry/registry-query.repo.ts`                            | BF A3 → FE US-2.1                      | dùng chung `STATE_SQL`                                  |

Không thấy thiết kế mâu thuẫn trực tiếp giữa ba SPEC ngoài MIN-8/MIN-9; phụ thuộc chéo (IN-1←DS.4, K1-GR←K1-CL, RQ-3←X0.3, PI-1←FX)
đã đúng thứ tự trong PLAN.

## Cần Owner

1. **ADR-0007 khi bỏ tỷ giá (BLK-1).** Khuyến nghị: giữ cột snapshot, ghi bản đồng nhất `SAME_CURRENCY`/rate 1 cho VND (không nới CHECK),
   ghi amendment ADR-0007 "đơn tiền tệ VND theo `QĐ-111an`". Phương án nới CHECK làm yếu bất biến DB — không khuyến nghị.
2. **Module `policies` ở T3 (FE §9 Q2).** Đã kiểm: mọi bên gọi (`requests`/`budgets` T5, `optimization` T7, parser ở `data-import`/`licensing`/
   `usage`/`budgets`) ở tầng cao hơn; `identity-access` (T2) nhận qua `Contributions` của chính nó; `policies` chỉ cần T1–T2. Khuyến nghị **đồng ý**,
   kèm sửa `scripts/arch/tiers.cjs`, bảng tầng, `PRISMA_MODEL_OWNER`, `app.module.ts`.
3. **Ai thấy `nextYearBudget` (MAJ-8).** Khuyến nghị: chỉ Người duyệt chi + Finance; preview của nhân viên chỉ có `cost.nextYear`.
4. **Phạm vi thông báo tăng seat `QĐ-110v` (MAJ-13).** Khuyến nghị: chỉ kho `K2`/`K4`; cấp `K1` (mua một seat cho một người) không báo.
5. **Quick check (MAJ-1).** Khuyến nghị: thêm `pnpm test:gates` + `pnpm rules:check` cuối mỗi gói (vài phút, không phải full suite); full suite
   vẫn để pha cuối/CI như pipeline hiện tại.

## Đã xử lý (13/11/2026)

Sửa vào [bug-fix v1.2](../be-bugfix-2026-11-12/SPEC.md) (BF), [MF-2/MF-3 v2.3](../mf2-mf3-2026-11-10/SPEC.md) (MF), [FE v2.1](SPEC.md) (FE) và
ba PLAN tương ứng. Pin `Docs main @ 373bb6b`; `OWNER-REVIEW` là nguồn luật (S-1…S-5 trả lời "Cần Owner" 1–5). Kết quả: **31/31 sửa**, 0 không
làm; hai điểm sửa khác đề xuất (ghi ở BLK-3).

| Mã            | Xử lý ở                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLK-1         | FE D2, FX-1, FX-2 (snapshot đồng nhất `SAME_CURRENCY`/tỷ giá 1, không nới CHECK, làm tròn ADR-0007); task FX-2.6 sửa đổi ADR-0007 (S-1)                                                                                                                                                                                                                                                                                                                                                               |
| BLK-2         | MF §5 X-SA, §6; PLAN X-SA.1a (DROP/ADD EXCLUDE trước) + X-SA.1b (kết thúc `SERVICE` + chèn `PERSONAL` mới, `MACHINE_ACCOUNT_CONVERSION`, `DO $$ RAISE`, liệt kê dòng có tác vụ/duty mở)                                                                                                                                                                                                                                                                                                               |
| BLK-3         | MF §5 MF3-B; PLAN MF3-B.3 (`afterRevocation` bỏ qua nguồn `TRANSFER`, `revocationShare` + `lockSeatCommitments` + `seat_monthly_minor`, reference `transfer:<id>:assignment:<id>`, test bất biến + mutation). **Khác đề xuất:** (a) không thêm trường — `RevocationCompletedFacts.sources` đã có (`licensing/public/licensing.types.ts:359`); (b) `endsOn` = **ngày hiệu lực**, không "− 1", vì `endsOn` cùng nghĩa `[)` với `endedOn` (`licensing.types.ts:354-355`, `seat-release.policy.ts:56-62`) |
| MAJ-1         | Ba PLAN §0: gate cuối mỗi gói (`pnpm test:gates` + `pnpm rules:check` + `prisma:validate`), task thêm thư mục/bảng/extension point/collection chạy `test:gates` ngay; dòng `*-G` mỗi gói (S-5)                                                                                                                                                                                                                                                                                                        |
| MAJ-2         | Capability mới đặt sẵn: `personnel/departure-deadline/`, `departure-closure/`, `transfer-grace/`, `it-handover/`, `identity-access/it-admin-directory/` (BF BB-5), `licensing/machine-account/` (MF X-SA.2)                                                                                                                                                                                                                                                                                           |
| MAJ-3         | Facade mới `catalog/public/catalog-responsibility.api.ts` (MF X-IT.2), `licensing/public/licensing-department-tools.api.ts` (MF DS.4), `licensing-seat-month.api.ts` (FE SM-1.3); xóa `licensing-handover.*` (X-H.3), `licensing-service-account.*` (X-SA.3); CT-1.8 dùng phụ thuộc có sẵn                                                                                                                                                                                                            |
| MAJ-4         | Quy ước chung BF PLAN §0 + FE D10; MF X0.0 (`…_mf23_values`), FE BG-2.0, PL-2.0; union TS `CommitmentReleaseReason`                                                                                                                                                                                                                                                                                                                                                                                   |
| MAJ-5         | MF §2, §6 (thay CHECK trên 5 bảng gồm `grounds_whole_check`/`kind_check`); PLAN X0.5 + X0.6a–d (tách theo luồng, `groundsNoteBodySchema` mới, notice giữ schema cũ)                                                                                                                                                                                                                                                                                                                                   |
| MAJ-6         | BF §2.1 viết lại theo 53 file; PLAN BB-2…BB-14, BO-DEL-1…3 (transfer, `catalog/plan`, `CatalogApi` 3 hàm, `offboarding-detail.service.ts:69,94`, `RETIREMENT_NOT_BUSINESS_OWNER`)                                                                                                                                                                                                                                                                                                                     |
| MAJ-7         | FE CT-1 + PLAN CT-1.1 (`SET DEFAULT false` 4 cột), CT-1.5 (mọi đường tạo ứng dụng đặt nhóm), CT-1.7 (`SET NOT NULL` sau cùng)                                                                                                                                                                                                                                                                                                                                                                         |
| MAJ-8         | FE RQ-2, XY-1 (`nextYearBudget` chỉ ở spend-approval cho SPENDING_APPROVER + FINANCE; preview không có) — S-3                                                                                                                                                                                                                                                                                                                                                                                         |
| MAJ-9         | FE §2 (5 lời gọi/3 file; `RATE_MISSING` 13 file + cột lưu), FX-1 (`RAISE` tổ chức không VND), PLAN FX-2.1–2.5 (giữ `rate.ts`; `line-import` không sửa vì bị xóa ở BG-2)                                                                                                                                                                                                                                                                                                                               |
| MAJ-10        | FE D11 (khóa `budget_cycles` trước khóa năm, `TRANSFER` theo id tăng dần, comment `BudgetYearLockRepo`), RV-2 unique 4 cột; PLAN BG-2.5, AD-1.2, RV-2.1                                                                                                                                                                                                                                                                                                                                               |
| MAJ-11        | BF §3, MF §4, FE D9 (`page/pageSize` ≤ 100, `maxItems`, summary ≠ detail, query-count); từng route mới ghi "phân trang"                                                                                                                                                                                                                                                                                                                                                                               |
| MAJ-12        | FE PF-1 + PLAN PF-1.4 (tx chỉ xóa cột + hàng đợi `avatar_purges`; sweeper API xóa object sau commit)                                                                                                                                                                                                                                                                                                                                                                                                  |
| MAJ-13        | MF P24, X-IT.7 (chỉ kho `K2`/`K4`, cấp `K1` không báo) — S-4                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| MIN-1         | MF §5 MF3-C (idempotent bằng `openRevocation` cùng nguồn + reference; seat có tác vụ sống ⟹ thêm lý do, không 23505)                                                                                                                                                                                                                                                                                                                                                                                  |
| MIN-2         | MF §5 MF3-C, PLAN MF3-C.3 (`Contributions`, không `Hook`)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| MIN-3         | MF P13 (23P01 ⟹ 409 `MACHINE_ACCOUNT_OVERLAP`, ghi chủ ý)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| MIN-4         | MF DS (`UNIQUE NULLS NOT DISTINCT`, partial unique `PENDING`), PLAN DS.1                                                                                                                                                                                                                                                                                                                                                                                                                              |
| MIN-5         | MF P20, PLAN X-IT.1 (khóa dòng IT Admin đích, áp BM-09/import)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| MIN-6         | MF §2, PLAN MF1-X.2 (`requests/step-routing/one-step-conversion.policy.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| MIN-7         | MF P22 `dashboards/revocation-sla/` (RD.2); service tác động dựng ở MF2-B.3/MF3-A.2, RD.3 chỉ thêm route                                                                                                                                                                                                                                                                                                                                                                                              |
| MIN-8         | BF §2.1: bỏ `businessOwnerApplications` không thay; trường duy nhất là `itHandover` (MF P3)                                                                                                                                                                                                                                                                                                                                                                                                           |
| MIN-9         | Quy ước chung (BF PLAN §0, FE D8): lọc list ⟹ rỗng, id trên path ⟹ 404; FE US-1, IN-1.3; BF B3                                                                                                                                                                                                                                                                                                                                                                                                        |
| MIN-10        | Quy ước chung + FE D12; task thêm thông báo liệt kê `notifications.types.ts`/`inbox.policy.ts` (MF X0.4, FE XY-1.3, PI-1.4, BG-1.3…)                                                                                                                                                                                                                                                                                                                                                                  |
| MIN-11        | FE D12, MF MF2-D (`eventKey = offboarding:<caseId>:<ngày>`), XY-1.3, RV-3.1 (khóa chống trùng); mục sweeper `security-jobs.md` ở mọi task sweeper                                                                                                                                                                                                                                                                                                                                                     |
| MIN-12        | FE RQ-1, PLAN RQ-1.2 (`renewal-request.dto.ts:29`); BF A1 (ví dụ `PROVISIONING_ERROR_EXAMPLES`)                                                                                                                                                                                                                                                                                                                                                                                                       |
| MIN-13        | BF §4 (join `app_users`, vị từ = `findUsableItAdminEmployeeIds`, test so khớp), §3 (khóa dòng `applications` khi nhận)                                                                                                                                                                                                                                                                                                                                                                                |
| MIN-14        | BF PLAN đổi tên task `BB-*`, `BO-DEL-*`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| MIN-15        | FE PI-1 (`spentOf` `LEFT JOIN`, `COALESCE` Cost Center + năm `service_month`), PLAN PI-1.5                                                                                                                                                                                                                                                                                                                                                                                                            |
| Cần Owner 1–5 | Đã trả lời trong `OWNER-REVIEW`: S-1 (= BLK-1), S-2 (`policies` T3), S-3 (= MAJ-8), S-4 (= MAJ-13), S-5 (= MAJ-1)                                                                                                                                                                                                                                                                                                                                                                                     |
