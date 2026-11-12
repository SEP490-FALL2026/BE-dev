# Tài khoản dịch vụ còn lại sau migration chuyển đổi

Từ `QĐ-110m` không còn loại "tài khoản dịch vụ". Migration `20261113000900_licensing_service_accounts_converted` kết thúc từng dòng `license_assignments.kind = 'SERVICE'` còn hiệu lực và ghi lại nó thành seat `PERSONAL` của một IT Admin, có cờ `is_machine_account` và ghi chú (nguồn `MACHINE_ACCOUNT_CONVERSION`, dòng cũ là `predecessor_id`). Migration chạy một lần khi deploy, nên **dòng nào chưa chuyển được lúc đó vẫn là `SERVICE` còn hiệu lực**. Ứng dụng không có route nào kết thúc hoặc chuyển một dòng `SERVICE` (không thêm route nghiệp vụ cho việc này), nên cách duy nhất là chạy lại đúng file migration sau khi lý do giữ dòng đã qua.

Bản phát hành dọn (bỏ loại `SERVICE`, bảng và enum tài khoản dịch vụ) cần số dòng còn hiệu lực bằng 0.

## Biết còn dòng nào

`pnpm ops:preflight` (cũng chạy ở mọi lần deploy) liệt kê mọi dòng `SERVICE` còn hiệu lực chưa có bản nối tiếp, chỉ bằng id, ở mục thông tin `SERVICE_ACCOUNT_STILL_IN_FORCE`. Mục này **không chặn** deploy: bản phát hành chuyển đổi cũng nằm trong số đó, và chặn thì chính bản sửa bị chặn. "Còn hiệu lực" nghĩa là chưa `failed`, chưa `cancelled`, không có ngày kết thúc hoặc ngày kết thúc sau hôm nay theo lịch của tổ chức. Số đếm bằng 0 nghĩa là không còn gì để làm.

Lý do từng dòng bị giữ chỉ có trong thông báo (`NOTICE`) của chính migration: mỗi dòng một thông báo `service account <id> stays as it is: <lý do>`. Đừng trông vào log của `prisma migrate deploy` để đọc chúng; chạy file bằng `psql` (bước dưới) thì chắc chắn thấy.

## Lý do giữ và việc cần làm

| Lý do trong thông báo                                                   | Việc cần làm trước khi chạy lại                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a task of the grant or of the revocation is still alive`               | IT Admin hoàn tất hoặc đóng tác vụ cấp/thu hồi của dòng đó bằng các route tác vụ có sẵn.                                                                                               |
| `a duty of handover is still open`                                      | Không nên còn: migration `20261113000500` đã hủy mọi duty bàn giao mở. Còn thì kiểm migration đó đã chạy chưa.                                                                         |
| `the person who answers for it has a personnel file that is not closed` | Đóng hồ sơ điều chuyển hoặc nghỉ việc của người chịu trách nhiệm (đến ngày hiệu lực, hoặc hủy).                                                                                        |
| `it has not started yet`                                                | Đợi đến ngày bắt đầu của dòng.                                                                                                                                                         |
| `it ends by itself on the day it would be converted`                    | Không làm gì: dòng tự hết hiệu lực, rời danh sách khi ngày kết thúc qua.                                                                                                               |
| `no IT Admin can take it`                                               | Có ít nhất một IT Admin dùng được: tài khoản `ACTIVE` đã kích hoạt, giữ vai `IT_ADMIN`, nhân viên còn làm việc và không thuộc loại có thời hạn (`CONTRACTOR`, `FREELANCER`, `INTERN`). |

Người nhận seat theo thứ tự: người chịu trách nhiệm cũ nếu là IT Admin dùng được, rồi IT Admin phụ trách phòng sở hữu, rồi IT Admin dùng được có mã nhân viên đứng đầu.

## Chạy lại migration

Migration viết để chạy lại được: dòng đã chuyển đã kết thúc nên không chuyển hai lần, Request đã hủy và bản nháp đã xóa không còn để xử lý. Chạy bằng vai deploy (`slm_deploy`), sau khi đã sao lưu (workflow deploy có bước sao lưu; ngoài workflow thì `pg_dump` như bước đó). Không sửa file: Prisma ghi checksum của nó. Chạy bằng `psql` không đổi `_prisma_migrations`.

```bash
L="docker compose --project-directory <APP_DIR> -f <APP_DIR>/docker-compose.prod.yml"
$L run --rm --no-deps -T migrate cat prisma/migrations/20261113000900_licensing_service_accounts_converted/migration.sql \
  | $L run --rm --no-deps -T backup psql -v ON_ERROR_STOP=1 --single-transaction -f -
```

Service `backup` là `postgres:17-alpine` với biến `PG*` của vai deploy, nên có sẵn `psql`; file nằm trong image API. Kết quả cần đọc:

- `service accounts in force before: N, converted: C, kept: K, in force after: A`: `C` dòng đã chuyển, `K` dòng còn giữ (mỗi dòng một thông báo nêu lý do). `A` gồm `K` dòng giữ và các dòng bắt đầu đúng ngày chạy (kết thúc vào ngày kế, đã có bản nối tiếp).
- Hai thông báo còn lại đếm Request `SERVICE_ACCOUNT` đã hủy (kèm số cam kết ngân sách đã giải phóng, số Request còn giữ) và bản nháp đã xóa.
- File dừng với `ERROR` thay vì chuyển sai khi số đếm không khớp (`Service accounts were lost in the conversion`): giao dịch lùi lại, không dòng nào đổi.

## Kiểm lại

`pnpm ops:preflight` không còn mục `SERVICE_ACCOUNT_STILL_IN_FORCE`. Mỗi dòng đã chuyển có một sự kiện Audit Trail `LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_CONVERTED` (actor `SYSTEM`, trước = dòng cũ, sau = dòng mới). Seat mới hiện ở `GET /license-assignments` với `isMachineAccount = true` và `machineAccountNote`; IT Admin tắt cờ hoặc đổi ghi chú bằng `POST /license-assignments/{id}/machine-account`.
