# Database và nghiệp vụ

## Persistence

- Model theo domain trong `prisma/models/`; module sở hữu bảng được khai báo ở
  [architecture test](../../src/architecture-boundaries.spec.ts).
- Chỉ `*.repo.ts` trong business module dùng Prisma. Module khác gọi public facade,
  không truy cập bảng/repository của nhau.
- Add schema only for the User Story being implemented. Do not scaffold unused models.
- Migration đã apply không viết lại. Review SQL, backfill, constraint và khả năng
  tương thích trước khi chạy trên database riêng. Không reset shared DB hoặc dùng
  production `db push` thay migration.
- Constraint Prisma không biểu diễn được viết SQL rõ ràng theo
  [ADR-0005](../decisions/0005-database-constraints-outside-prisma.md).

## Transaction và hành vi

- Xác định actor, resource scope, trạng thái đầu/cuối và acceptance criteria trước write.
- Authentication không thay authorization. Không tự duyệt; Finance tư vấn/ghi nhận,
  Spending Approver quyết định chi theo yêu cầu của task.
- Capacity/uniqueness/overlap cần DB constraint/transaction phù hợp, không chỉ check-then-insert.
- Cross-module atomic write dùng `TransactionRunner.run` và `DbTx` ở
  [transaction-runner.ts](../../src/infrastructure/database/transaction-runner.ts).
  Facade nhận cùng `tx`; khóa dữ liệu của module khác cũng qua facade. Runner dùng
  Read Committed, đặt lock/statement timeout theo giao dịch; không tự mở giao dịch con.
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
