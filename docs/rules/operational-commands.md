# Lệnh vận hành ngoài HTTP

Áp dụng cho mọi lệnh chạy từ terminal ngoài API/worker: `pnpm ops:bootstrap`, `pnpm ops:recover`, `pnpm ops:inspect`,
`pnpm dev:seed` và lệnh thêm sau. Gate: [operational-commands.spec.ts](../../src/operational-commands.spec.ts) (cấu
trúc, import, chuỗi bị cấm), [module-graph.spec.ts](../../src/module-graph.spec.ts) (đồ thị Nest) và test của từng
lệnh. Vị trí file theo [module structure](module-structure.md); dữ liệu và transaction theo
[database rules](database-business.md).

## Tám quy tắc

1. **Lệnh chỉ đọc** nạp một đồ thị tối thiểu, chỉ gồm phụ thuộc nó kiểm tra, và **không ghi được** kể cả khi một query
   hay callback bị sửa nhầm: phiên PostgreSQL của nó mở với `default_transaction_read_only=on`
   (`ReadOnlyDatabaseSessionModule`), nên server từ chối mọi lệnh ghi (SQLSTATE `25006`). Kiểm "chỉ đọc" bằng bằng
   chứng ở database, không chỉ bằng mock.
2. **Lệnh ghi local** cần đủ **ba** chốt độc lập, kiểm trước khi mở transaction ghi: `NODE_ENV` được phép (`development`
   hoặc `test`), host của `DATABASE_URL` hiệu lực **parse** ra là loopback (`localhost`, `127.0.0.0/8`, `::1`), và cờ xác
   nhận tường minh (`--confirm-local`). Không có `--force` hay cờ chung nào bỏ qua một chốt.
3. **Entry CLI và module lệnh không tới được từ `AppModule` và `WorkerModule`** (cả import TypeScript lẫn đồ thị Nest).
4. **Phân vai:** entry (`src/*-cli.ts`) parse tham số, in kết quả, chọn mã thoát; repository query; service
   application/domain thực thi workflow và ghi Audit Trail. Không Prisma trực tiếp hay raw SQL trong entry hoặc service
   điều phối.
5. **Không commit mật khẩu, token, hash hay private key mặc định.** Credential sinh ra (CSPRNG) chỉ được in **một lần**
   ra terminal gọi lệnh; không log, không audit, không trả lại ở lần chạy lặp.
6. **Vai demo theo đúng ownership:** `SUPER_ADMIN`, `IT_ADMIN`, `FINANCE`, `EMPLOYEE` là vai trực tiếp; `MANAGER`,
   `SPENDING_APPROVER` suy ra từ dữ liệu phòng/cấu hình và **không bao giờ** được chèn thành grant.
7. **Lệnh, fixture và test chia theo capability/use case** dưới cùng ngưỡng kích thước và quy tắc phụ thuộc của
   [module structure](module-structure.md).
8. **Dọn tài nguyên:** mọi bước kiểm tra tạo container, image, database tạm, tiến trình hay file phải **đăng ký cleanup
   trước khi tạo** và thực hiện trong `finally`/teardown tương đương. Báo cáo xanh mà còn container smoke bị quên vẫn
   là chưa xong; kiểm kê cuối phải chứng minh 0 tài nguyên còn sót **của gói đó**. Test chỉ khởi chạy tiến trình con
   qua [`test/support/cli-process.ts`](../../test/support/cli-process.ts), nơi tiến trình được ghi nhận trước khi chờ và
   bị dừng khi test kết thúc hoặc tiến trình Jest thoát.

## Ví dụ

**Đúng:**

- `NODE_ENV=development`, `DATABASE_URL` có host parse ra `127.0.0.1`/`localhost`/`::1`, cờ `--confirm-local`.
- Mật khẩu tài khoản mới sinh bằng `randomBytes`, in một lần; test tiêm generator cố định.
- Ghi qua service của module sở hữu (`OrganizationService`, facade của `identity-access`) và `AuditService`.

**Sai:**

- Seed chạy trong bootstrap của API; chấp nhận mọi môi trường khác `production`.
- Kết nối tới host `postgres` (tên service Docker) hay một hostname/IP từ xa.
- Commit `Password123!` hay bất kỳ mật khẩu mặc định nào.
- Grant trực tiếp `MANAGER`; ghi Prisma thẳng vào bảng của module khác.

**Lách sai (cũng là sai):**

- Kiểm `DATABASE_URL.includes('localhost')` — `localhost.example.com` và `?host=` đều lọt qua.
- Giấu lệnh seed sau một script khác; import provider seed vào `AppModule`.
- Thêm `--force` chung; dời assertion vào harness trong `test/support`.

**Dọn sai:**

- Chỉ dừng container smoke khi tình cờ thấy chúng ở cuối lượt.
- Dựa vào `--rm` mà không xử lý tiến trình test bị kill.
- Xóa mọi orphan Docker thay vì đúng tài nguyên có tên do gói tạo (`docker rm -f <tên chính xác>`).

## Hợp đồng lệnh hiện có

| Lệnh                               | Đồ thị / cấu hình                                   | Ghi                               | Mã thoát                                                |
| ---------------------------------- | --------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| `pnpm ops:bootstrap`               | `InstallationModule`, chỉ env database              | một lần, có audit                 | 0 xong · 1 lỗi · 2 đã cài · 130 hủy                     |
| `pnpm ops:recover`                 | `RecoveryCliModule`, env đầy đủ                     | theo phiếu, có audit              | 0 xong · 1 lỗi · 2 không cần làm                        |
| `pnpm ops:inspect [--json]`        | `InspectionModule`, chỉ env database, phiên chỉ đọc | không bao giờ                     | 0 đã cài và nhất quán · 2 chưa cài hoặc dở dang · 1 lỗi |
| `pnpm dev:seed -- --confirm-local` | `DevSeedModule`, chỉ env database, ba chốt local    | dữ liệu demo idempotent, có audit | 0 đã tạo · 2 đã có đủ · 3 bị từ chối, không ghi · 1 lỗi |

Chi tiết từng lệnh: `--help` của lệnh và
[hạng mục H6.1 + H6.2](../workspace/items/installation-local-data-h6-1-h6-2/spec.md).
