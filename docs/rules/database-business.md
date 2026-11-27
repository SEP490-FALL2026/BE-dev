# Database và nghiệp vụ

## Persistence

- Model theo domain trong `prisma/models/`; module sở hữu bảng được khai báo ở
  [architecture test](../../test/gates/architecture-boundaries.gate-spec.ts).
- Chỉ `*.repo.ts` trong business module dùng Prisma. Module khác gọi public facade,
  không truy cập bảng/repository của nhau.
- Add schema only for the User Story being implemented. Do not scaffold unused models.
- Migration đã apply không viết lại. Review SQL, backfill, constraint và khả năng
  tương thích trước khi chạy trên database riêng. Reset DB demo dùng chung chỉ qua Owner-run `seed.sh`, có
  `SEED_ALLOW_RESET=true`, xác nhận đúng tên DB và dump đã kiểm trước khi xóa; xem [seed](../guides/seed.md).
  Không dùng production `db push` thay migration. Reset local chỉ qua wrapper có chốt development/loopback và xác nhận.
- Constraint Prisma không biểu diễn được viết SQL rõ ràng theo
  [ADR-0005](../decisions/0005-database-constraints-outside-prisma.md).
- **Tên migration (`DB-15`):** `YYYYMMDDHHMMSS_<snake_case>` với thời điểm hợp lệ (giờ `00`–`23`, phút/giây `00`–`59`) và
  lớn hơn migration cuối đã merge, để thứ tự áp dụng là thứ tự đọc. Ba migration đã merge `20261020240000`,
  `20261020250000`, `20261020260000` mang giờ 24–26: thứ tự vẫn tất định (so chuỗi) nên **giữ nguyên tên** — đổi tên một
  migration đã áp làm `_prisma_migrations` lệch với thư mục. Không đổi tên hay sửa migration đã merge. Gate
  `test/gates/migration-order.gate-spec.ts` (trong `pnpm check`) đọc danh sách migration đã merge ở `scripts/verify/merged-migrations.txt` (mỗi dòng
  một thư mục, thêm dòng khi merge một bản phát hành): migration chưa có trong danh sách phải đứng sau migration cuối của danh sách, và
  migration đã merge không bị đổi tên hay xóa.
- **Drift (`DB-16`):** CI áp mọi migration vào CSDL rỗng rồi chạy
  `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`; sửa `prisma/models` mà thiếu migration
  làm bước này đỏ.
- **Không có down migration (`DB-05`):** sửa lỗi sau khi đã áp là **roll-forward** (migration mới sửa tiếp) hoặc
  **khôi phục** từ bản sao lưu deploy tạo trước `migrate deploy` (quy trình ở
  [containers](../guides/containers.md#backup-before-production-migrations)). Migration không hoàn tác được — ví dụ
  `ALTER TYPE … ADD VALUE`, xóa cột/bảng có dữ liệu — ghi rõ trong spec của hạng mục trước khi merge.

## Cột JSON: một codec, đọc qua `decode`

- Mỗi cột `Json`/`Json?` có **một** codec `<tên>.json.ts` ([từ vựng file](module-structure.md#từ-vựng-file)): schema zod là nơi duy nhất
  định nghĩa hình dạng (kể cả giá trị mặc định, ví dụ `binding` mặc định `true` của `payment_schedule`), kiểu domain suy từ schema hoặc
  được schema kiểm bằng `satisfies z.ZodType<…>`, `decode(value: unknown)` và `encode(value)`. Dựng bằng `jsonColumn` /
  `nullableJsonColumn` ở [json-column.ts](../../src/infrastructure/database/json-column.ts); cột `NULL` được phép thì `decode(null)` trả
  `null` và `encode(null)` ghi `NULL` của cơ sở dữ liệu (`Prisma.DbNull`).
- Repo và mapper **đọc mọi cột JSON qua `decode`** và ghi qua `encode`; không `as <Kiểu>` và không `as unknown as` trên giá trị đọc từ cột
  JSON hay từ `$queryRaw` (kiểu của hàng đến từ generic của câu truy vấn cộng một hàm ánh xạ tường minh).
- Một cột có **hai hình dạng theo trạng thái của dòng** thì có hai codec và mỗi codec chỉ đọc dòng ở trạng thái của nó: `access_requests.policy`
  là `{ draft: … }` khi dòng là bản nháp (`request-draft-policy.json.ts`) và `RequestPolicy` khi request đã gửi (`access-request.json.ts`). Chỗ nào
  đọc dòng chưa biết trạng thái thì kiểm trạng thái trước rồi mới `decode`; không chỗ nào đọc một cột JSON bằng ép kiểu, dù chỉ một cấp
  (`row.policy as { chain?: … }`).
- `decode` thất bại ném `JsonColumnShapeError(table, column, issues)`
  ([json-column.errors.ts](../../src/infrastructure/database/json-column.errors.ts)): lỗi hạ tầng, đi đường lỗi không nhận diện được
  thành 500 (không có ánh xạ HTTP riêng). Thông báo nêu bảng, cột, vị trí và loại lỗi, **không bao giờ giá trị**: một cột có thể mang tên,
  số tiền hay địa chỉ. Một bản ghi sai hình dạng là lỗi dữ liệu, ghi thành hạng mục riêng, không nới codec cho vừa. Ngoại lệ có chủ ý: một giá trị mà code đã thôi ghi nhưng dòng cũ còn giữ (một mã lỗi đã bỏ) vào danh sách `RETIRED_…` của chính codec đó, có ngày bỏ trong comment: đọc được, không bao giờ ghi lại, cho tới khi một migration dữ liệu viết lại dòng (ví dụ `RETIRED_SEAT_ROW_ERROR_CODES`).
- `encode` giữ **đúng hình dạng đã ghi từ trước**: spec của codec có một khẳng định bằng giá trị cụ thể cho điều đó. Đổi hình dạng JSON là
  đổi schema, không phải đổi codec: cần migration dữ liệu và ghi trong spec của hạng mục.
- Payload tự do (audit `before`/`after`, `params` của thông báo, `detail` của hồ sơ nghỉ việc …) cũng có codec, chỉ kiểm "một object của
  giá trị JSON"; khóa của nó không liệt kê.

## Vai PostgreSQL (H7)

- Production có ba danh tính ([containers](../guides/containers.md#postgresql-roles-h7)): superuser của cluster chỉ khởi
  tạo/sửa vai; deploy role sở hữu schema và chạy backup, preflight, migration, `ops:db-roles reconcile`; runtime role của
  API/worker chỉ có DML trên bảng ứng dụng (không gì trên `_prisma_migrations`, chỉ `SELECT, INSERT` trên `audit_events`).
  Khởi động production từ chối superuser, owner hay role có membership.
- Migration **không** nêu tên vai (`GRANT`/`REVOKE`/`OWNER TO`): nó phải chạy được trên database tạm của integration, nơi
  không có vai nào; quyền do `ops:db-roles` cấp và default privileges của deploy role phủ bảng mới.
- Bảng mới cần quyền runtime khác DML thường (chỉ ghi thêm, chỉ đọc) thêm vào `RUNTIME_TABLE_EXCEPTIONS` của
  [database-role-judgement.ts](../../src/infrastructure/database/database-role-judgement.ts) trong cùng thay đổi. Không tạo hàm
  `SECURITY DEFINER` trong `public`: nó chạy với quyền owner cho runtime role (`reconcile` báo `SECURITY_DEFINER_ROUTINE`).
- **Sequence (H7-SEQ):** runtime chỉ có `USAGE` trên mọi sequence và trong default privileges của sequence tương lai, **trừ** hai
  sequence mà việc đánh số còn đọc và nâng bằng `setval` để image tương thích không bao giờ lặp một số đã cấp:
  `personnel_notice_seq` (`NoticeRepo.nextCode`, BM-09) và `saas_issue_seq` (`SaasIssueRepo.nextCode`, BM-11) giữ đúng
  `SELECT, UPDATE`. `setval` cần `UPDATE` và `nextval` chấp nhận `UPDATE` hoặc `USAGE`
  ([PostgreSQL 17](https://www.postgresql.org/docs/17/functions-sequence.html)), nên không cấp thêm `USAGE`. Đọc trạng thái
  (`SELECT … FROM <sequence>`) cần `SELECT`: hướng dẫn chỉ nêu `currval`, còn PostgreSQL 17 từ chối `42501` khi thiếu và test
  `database-runtime-sequences` khóa điều đó. Chính sách là `RUNTIME_SEQUENCE_EXCEPTIONS` trong
  [database-role-judgement.ts](../../src/infrastructure/database/database-role-judgement.ts), một nguồn cho cả lệnh cấp quyền
  (`provision`, `reconcile`) lẫn `verify`: thiếu hay thừa đều là `RUNTIME_SEQUENCE_PRIVILEGES`. Sequence khác mà code đọc trạng
  thái hay gọi `setval` thì thêm vào đó trong cùng thay đổi (gate `runtime-sequence-privileges` bắt cả thiếu lẫn dư). Không
  `GRANT` tay sau deploy: `reconcile` thu lại mọi quyền ngoài chính sách. Sequence chưa có ở baseline cũ không bị `GRANT`; migration tạo
  nó xong thì `reconcile` kế tiếp mới cấp, và tới lúc đó runtime bị từ chối `42501` (fail closed).
- Trigger vẫn là nơi giữ bất biến (`INV-05`, …); quyền chỉ là lớp chặn thêm — owner vẫn bị trigger từ chối.

## Transaction và hành vi

- Xác định actor, resource scope, trạng thái đầu/cuối và acceptance criteria trước write.
- Authentication không thay authorization. Không tự duyệt; Finance tư vấn/ghi nhận,
  Spending Approver quyết định chi theo yêu cầu của task.
- Capacity/uniqueness/overlap cần DB constraint/transaction phù hợp, không chỉ check-then-insert.
- Cross-module atomic write dùng `TransactionRunner.run` và `DbTx` ở
  [transaction-runner.ts](../../src/infrastructure/database/transaction-runner.ts).
  Facade nhận cùng `tx`; khóa dữ liệu của module khác cũng qua facade. Runner dùng
  Read Committed, đặt lock/statement timeout theo giao dịch; không tự mở giao dịch con.
- Một client transaction chạy **một truy vấn một lúc**: không `Promise.all` (cũng `allSettled`, `race`, `any`) trên `tx` hay biến gán từ
  `tx ?? …`, dù là `tx.model.x()` hay `repo.x(tx)` (gate `module-layout`, R2). pg 8.23 xếp hàng chúng và in cảnh báo deprecated
  ("Calling client.query() when the client is already executing a query"); thứ tự đọc là thứ tự `await`, và một câu lỗi không còn
  để các câu khác chạy tiếp trong transaction đã hỏng. Đọc song song trên pool (`this.prisma`, không `tx`) vẫn được.
- Required audit/durable delivery intent cùng transaction với business write; gọi
  network sau commit. Thiết kế này phải được implement/test khi workflow được thêm.
- PostgreSQL mặc định Read Committed: hai SELECT trong một transaction vẫn có thể
  thấy snapshot khác nhau. Nếu page/count phải khớp, chọn isolation phù hợp và test
  concurrent write; sort có tie-breaker duy nhất như `name, id`.
- Money implementation mới theo [ADR-0007](../decisions/0007-money-representation.md);
  không tự chọn biểu diễn khác từ schema phác thảo.

### Thứ tự khóa chuẩn

Thứ tự chuẩn trong mọi transaction nhiều bảng là **tác vụ → Request** (tác vụ đứng trước Request).

**Quy tắc chung:**

- Mỗi transaction lấy khóa **từ trên xuống**. Không lấy khóa của một tầng trên sau khi đã giữ khóa tầng dưới, trừ luật vòng lặp nhiều seat và ngoại lệ E1–E4 bên dưới.
- Trong cùng một tầng, khóa theo khóa sắp xếp ở cột 3.
- Advisory lock dùng `pg_advisory_xact_lock`, lấy lại trong cùng transaction là an toàn.
- Mọi luồng mới cần một integration test đồng thời: 2 connection có barrier, kỳ vọng không deadlock (`40P01`) và bất biến giữ nguyên.
- Bảng chỉ phủ các bảng mà nhiều luồng tranh chấp chéo. Gốc riêng của một luồng (khuyến nghị ghost seat, `purchase_invoices`, lô nhập) khóa ngay sau tầng 0 của luồng đó; thêm hàng vào bảng khi một luồng thứ hai bắt đầu khóa chúng.

| #   | Tầng                                                                                                                                                                                                                                                                                       | Sắp theo                    | Ví dụ hiện có                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Khóa lượt / idempotency (advisory hoặc unique claim): lượt 01/01, `seat-month:<sub>:<month>`, `commitment-month:<org>:<month>`, `k1-allocation:<key>:<year>`, key đẩy sớm, khóa lô, unique ca gia hạn mỗi kỳ                                                                               | khóa                        | `year-start-commitments.service.ts`, `seat-month-subscription.service.ts`, `commitment-month-settlement.service.ts`, `k1-year-start-application.service.ts`, `invoice-allocation-transfer.service.ts`, `escalation.service.ts`       |
| 0b  | `seat_baseline_states` (`FOR SHARE` khi giữ pha khởi tạo mở qua `LicensingSeatBaselineApi.holdInitializationOpen`; `FOR UPDATE` khi đóng baseline)                                                                                                                                         | khóa                        | `seat-baseline.service.ts`, `initial-record.service.ts`, `license-key.service.ts` (nhập khóa có lượt ban đầu)                                                                                                                        |
| 0c  | `device_code_counters` (theo `(device_type, year)`) — luôn sau `0b`, trước mọi khóa máy                                                                                                                                                                                                    | khóa                        | `asset-code.service.ts` (nhập máy mới, nhập hiện trạng thiết bị)                                                                                                                                                                     |
| 1   | `employees` (`FOR SHARE` / `FOR UPDATE`), rồi hồ sơ nghỉ việc / điều chuyển; chỉ định làm thay IT khóa `employees` (tầng 1) → `departments` (tầng 2); chỉ định việc chưa xếp phòng khóa hai nhân viên trong một câu theo `id` tăng dần                                                     | id                          | `block-announcement.service.ts`, `transfer-revocation.service.ts`, `provisioning-holder.service.ts`, `registry.service.ts`, `department-it-substitute.service.ts`, `unplaced-work-designation.repo.ts`                               |
| 2   | `departments` `FOR SHARE` (`FOR UPDATE` khi chỉ định/gỡ làm thay IT hoặc đổi IT phụ trách; `department_it_substitutes` đi theo khóa phòng); advisory `requests.limits:<emp>`                                                                                                               | id                          | `request-limits.repo.ts`, `department-it-substitute.service.ts`                                                                                                                                                                      |
| 2b  | `managed_devices` `FOR UPDATE` → `device_registrations` `FOR UPDATE` → `device_return_tasks` `FOR UPDATE` (nhiều máy khóa theo `id` tăng dần trong một câu trước đăng ký; mở/gỡ/chuyển kích hoạt `DEVICE_KEY` đi `2b → 6a → 7 → 7b → 8`)                                                   | id                          | `registry.repo.ts`, `replacement.service.ts`, `device-return-task.service.ts`                                                                                                                                                        |
| 3a  | `provisioning_tasks` — **tác vụ cấp của Request**                                                                                                                                                                                                                                          | id                          | Phía Request: khóa tác vụ trước Request (`withdrawal-preconditions.service.ts`, `group-withdrawal.service.ts`, v.v.). Phía IT: khóa tác vụ rồi Request (`provisioning-task-frame.service.ts` rồi `access-request-grant.listener.ts`) |
| 3b  | `provisioning_tasks` — **tác vụ thu hồi của assignment**                                                                                                                                                                                                                                   | id                          | `revocation.service.ts`                                                                                                                                                                                                              |
| 4   | `access_requests`, rồi `access_request_lines`                                                                                                                                                                                                                                              | id; dòng theo `employee_id` | `spend-batch.service.ts` (`lockAll` theo id); `step-reassignment.repo.ts`                                                                                                                                                            |
| 5   | `budget_cycles` `FOR UPDATE`, rồi proposal, rồi version của (CC, năm)                                                                                                                                                                                                                      | id                          | `budget-year-lock.repo.ts`                                                                                                                                                                                                           |
| 5b  | `workspaces` `FOR UPDATE` (luồng đã biết kỳ — `subscriptionUpdate` đổi `workspaceId`, `subscriptionComplete`, `subscriptionLineAdd` — áp quy trình N5: đọc `workspace_id` không khóa → khóa workspace theo `id` tăng dần → khóa kỳ → đọc lại `workspace_id`, lệch thì rollback và thử lại) | id                          | `workspace-for-subscription.service.ts`, `workspace-admins.service.ts`, `workspace.service.ts`, `subscription-change.service.ts`, `subscription-line.service.ts`, `license-lot-create.service.ts`                                    |
| 6   | `subscriptions` (kỳ; khi đổi cờ primary khóa mọi subscription primary của plan + chính nó + kỳ trước cùng một câu)                                                                                                                                                                         | id                          | `subscription.repo.ts` (`lockPrimaryCandidates`), `subscription-period.service.ts`, `seat-target.service.ts`, `seat-ledger.service.ts`                                                                                               |
| 6a  | `license_lots` `FOR UPDATE` (thay tầng `6` cho `K4`; `LicenseLotApi.lockLot` khóa lô `6a` rồi khóa `plans` `FOR SHARE` tầng `7`, sau đó mới khóa `license_keys` `7b` và `license_assignments`/`device_activations` `8`)                                                                    | id                          | `license-lot-lock.service.ts`, `license-lot.service.ts`, `license-lot-key-import.service.ts`, `device-activation.service.ts`, `license-lot-cost.service.ts`                                                                          |
| 6c  | `subscription_lines` `FOR UPDATE`; nhiều dòng khóa bằng một câu `SELECT … WHERE id = ANY($1) ORDER BY id FOR UPDATE`                                                                                                                                                                       | id                          | `subscription-line.repo.ts`, `seat-target.service.ts`, `seat-ledger.service.ts`, `seat-purchase-route.service.ts`, `subscription-line-correction.service.ts`                                                                         |
| 6d  | `seat_purchases`, `seat_changes` — **chỉ chèn**, không chờ khóa (trong transaction đã giữ tầng `6c`)                                                                                                                                                                                       | —                           | `seat-purchase.repo.ts`, `seat-ledger.repo.ts`                                                                                                                                                                                       |
| 7   | `plans` (`FOR SHARE`; `FOR UPDATE` khi đổi primary)                                                                                                                                                                                                                                        | id                          | `seat-target.service.ts`, `license-lot-lock.service.ts`, `subscription-change.service.ts`                                                                                                                                            |
| 7b  | `license_keys` (`FOR SHARE` / `FOR UPDATE`, sau lô `6a` và gói `7`, trước quyền/kích hoạt `8`; không còn tên tầng `6b`)                                                                                                                                                                    | id                          | `license-key.service.ts`, `license-key-assignment.service.ts`, `device-activation.service.ts`                                                                                                                                        |
| 8   | `license_assignments` / `device_activations`                                                                                                                                                                                                                                               | id                          | `assignment-end.service.ts`, `device-activation-close.service.ts`                                                                                                                                                                    |
| 9   | `budget_commitments`                                                                                                                                                                                                                                                                       | năm, rồi id                 | `commitment.repo.ts`, `commitment-month-settlement.service.ts`                                                                                                                                                                       |
| 9b  | `budget_commitment_months` `FOR UPDATE` (áp seat-tháng, giải phóng theo tháng/sự kiện)                                                                                                                                                                                                     | (`commitment_id`, tháng)    | `commitment-month.repo.ts`, `seat-month-subscription.service.ts`, `commitment-month-settlement.service.ts`                                                                                                                           |
| 10  | advisory CC-year `budget-year:<cc>:<năm>`                                                                                                                                                                                                                                                  | cc id, rồi năm tăng dần     | `budget-year-lock.repo.ts`                                                                                                                                                                                                           |

- Không còn tên tầng `6b` (khóa `license_keys` đứng ở tầng `7b`, sau `plans` `7`). Vòng lặp nhiều cam kết (chốt tháng, dọn năm cũ) chạy **mỗi cam kết một transaction**, sắp theo `(year, id)`.
- **Quy trình N5 (luồng đã biết kỳ nhưng cần khóa `workspaces` trước `subscriptions`):** đọc `workspace_id` không khóa → khóa các `workspaces` liên quan theo `id` tăng dần (`5b`) → khóa `subscriptions` (`6`) → đọc lại `workspace_id` dưới khóa; nếu khác lần đọc đầu thì rollback và thử lại (`retryOnWorkspaceMove`).
- **3a và 3b** cùng đứng trên Request (4), subscription (6), lô (6a), dòng (6c) và assignment (8). Transaction cần cả hai thì 3a trước 3b. Tạo tác vụ mới là **chèn**, không chờ khóa (`claimForGrant` khóa Request rồi chèn tác vụ cấp).
- **Luật vòng lặp nhiều seat:** mỗi seat khi mở thu hồi đi qua tác vụ → subscription/lô → (plan) → assignment, nên một transaction thu hồi nhiều seat tất yếu quay lại tầng 3b sau tầng 8 của seat trước. Được phép **chỉ khi** mọi transaction như vậy xử lý seat theo cùng một khóa đã sắp: `(subscriptionId, assignmentId)` (một hàm so sánh dùng chung, `compareSeatLockOrder` ở `src/core/seat-lock-order.ts`), mỗi seat xong trọn rồi mới sang seat kế. Áp dụng ở: nghỉ việc (`offboarding-revocation.service.ts`), lô thu hồi ghost seat (`decision.service.ts`), thu quyền điều chuyển (`transfer-revocation.service.ts`). Vòng lặp mới trên nhiều seat phải theo luật này.

**Ngoại lệ có chủ đích (ghi rõ, không thêm mới khi chưa sửa bảng):**

- **E1:** quyết phiên bản lấy CC-year (10) rồi `UPDATE` commitment **đang chờ** (`attachedVersionId = null`, tầng 9). Hệ quả: transaction nào đã khóa một commitment đang chờ thì **không** lấy CC-year của (CC, năm) đó. Hai nơi áp dụng: hóa đơn và seat-tháng.
- **E2:** gửi Request từ nháp khóa dòng nháp (tầng 4) **trước** employee `FOR SHARE` (tầng 1) (`request-draft.repo.ts`). **Đã kiểm, an toàn:** không luồng nào giữ employee rồi khóa một dòng `DRAFT` — tập Request mở dùng khi hủy vì người thụ hưởng đi loại `DRAFT` (`open-request.repo.ts`).
- **E3:** điều chỉnh ngân sách khóa cycle (5) rồi CC-year của từng CC theo id tăng dần (`BudgetAdjustmentLockService`). Ngoại lệ này khớp bảng; ghi lại để không sửa nhầm.
- **E4:** hủy hồ sơ nghỉ việc sau mốc chặn khóa máy và tác vụ thu máy (tầng 2b) **sau** vòng rút thu hồi ghế (tầng 3b–8): `offboarding-cancel-writer.service.ts` → `offboarding-cancel-takeback.service.ts` (rút lý do từng ghế: 3b → 6 → 8) → hook `onCancelled` → `device-registration.listener.ts` (`managed_devices` `FOR UPDATE` và `cancelReturnTasksOfCase`, tầng 2b), trong khi luồng kích hoạt/gỡ/chuyển/ngừng dùng máy giữ tầng 2b rồi khóa `subscriptions` (tầng 6). **An toàn vì tập rời nhau:** vòng ghế chỉ khóa thuê bao gói `ACCOUNT` (`license_assignments`), còn luồng máy chỉ khóa thuê bao gói `DEVICE_KEY` (ràng buộc `license_key_assignment_plan_account` và `plans_change_keeps_key_binding*` ngăn hai tập giao nhau); luồng máy không khóa `provisioning_tasks` hay `license_assignments`. Hệ quả: transaction đã giữ khóa máy (tầng 2b) thì **không** khóa thuê bao của gói `ACCOUNT`; muốn thêm luồng như vậy phải sửa bảng này trước.

## Kiểm tra

`pnpm prisma:validate`, sinh client, `pnpm check`, và integration test phù hợp.
[Tests](../../test/README.md): all integration suites use owned disposable databases.
Mock không chứng minh constraint, isolation hoặc migration.
