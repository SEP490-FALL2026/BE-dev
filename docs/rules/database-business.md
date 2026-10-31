# Database và nghiệp vụ

## Persistence

- Model theo domain trong `prisma/models/`; module sở hữu bảng được khai báo ở
  [architecture test](../../test/gates/architecture-boundaries.gate-spec.ts).
- Chỉ `*.repo.ts` trong business module dùng Prisma. Module khác gọi public facade,
  không truy cập bảng/repository của nhau.
- Add schema only for the User Story being implemented. Do not scaffold unused models.
- Migration đã apply không viết lại. Review SQL, backfill, constraint và khả năng
  tương thích trước khi chạy trên database riêng. Không reset shared DB hoặc dùng
  production `db push` thay migration.
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

## Kiểm tra

`pnpm prisma:validate`, sinh client, `pnpm check`, và integration test phù hợp.
[Tests](../../test/README.md): all integration suites use owned disposable databases.
Mock không chứng minh constraint, isolation hoặc migration.
