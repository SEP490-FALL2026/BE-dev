# Spec: chẩn đoán lỗi chạy lại `ops:demo-dataset` (A-04, RA-08)

- Phụ trách: AI theo giao việc Dev A (backlog 31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Dev A; đầu vào [DEV-A A-04](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md)
  và finding RA-08 của [báo cáo 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `578f442` (cùng baseline của `shared-demo-dataset`; hạng mục vận hành, không dùng Story/AC nghiệp vụ), BE
  `6eb12d1`.
- Nhóm roadmap: vận hành ngoài nhóm G — chỉ là container (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · [bằng chứng](evidence.md) · [hướng dẫn kiểm chứng cho operator](operator-verification.md).

## Business outcome

Operator chạy lại `ops:demo-dataset` (cách A trên VPS hoặc cách B qua SSH tunnel) nhiều lần mà phần tài khoản demo không còn
hỏng vì thời gian khứ hồi tới PostgreSQL; khi database thật sự ngừng trả lời, báo cáo nói rõ nguyên nhân bằng mã (không
URL, không giá trị) để phân biệt lỗi hạ tầng với lỗi lệnh. Kiểm bằng integration test trên PostgreSQL cô lập với độ trễ giả
lập và bằng tái hiện CLI build thật (production mode, runtime role).

## Sizing decision

- Container: finding RA-08 / DEV-A A-04 (backlog 31/10/2026), vận hành của lệnh `ops:demo-dataset`.
- Mode: `technical-enabler`.
- Outcome and owner: lệnh `ops:demo-dataset` chạy lại được qua kết nối chậm; capability `installation/demo-dataset`
  (`DemoAccountsApi`), CLI `src/cli/demo-dataset/`, `src/infrastructure/database/session-advisory-lock.ts`.
- Boundaries: không migration, bảng, route hay contract HTTP mới; không đổi `TransactionRunner`, pool hay giới hạn
  `DB_*`; transaction của tài khoản demo từ một-cho-cả-lượt thành một-cho-mỗi-tài-khoản; báo cáo lỗi thêm mã nguyên nhân.
- Not larger: không gom `P04-CPE-01` (503 không tái hiện trong suite khác) hay việc batch hóa repository của
  `identity-access`; không chạy trên VPS.
- Not smaller: chẩn đoán, sửa và hướng dẫn kiểm chứng phục vụ cùng một lần chạy lại của operator.
- Siblings: none.
- Scope map: n/a

## Primary Story/AC

| Story | AC      | Coverage | Phần còn lại thuộc                                                                                                                           |
| ----- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `RA-08` | n/a      | gỡ chặn `shared-demo-dataset-vps-load`: Owner/operator kiểm chứng theo [operator-verification](operator-verification.md) khi được giao quyền |

`RA-08` = nguyên nhân có bằng chứng của lỗi kết nối khi chạy lại demo seed CLI, bản sửa nếu thuộc code, test
rerun/idempotency và hướng dẫn kiểm chứng (DEV-A A-04). Hạng mục sở hữu toàn bộ các vế đó trừ việc chạy trên VPS.

## Supporting references

[shared-demo-dataset](../shared-demo-dataset/spec.md) (thiết kế lệnh), [runbook demo-dataset](../../../guides/demo-dataset.md),
[operational commands](../../../rules/operational-commands.md), `src/infrastructure/database/pg-pool.ts` (kết nối "retired"),
`transaction-runner.ts` (ngân sách transaction), [containers](../../../guides/containers.md#postgresql-roles-h7).

## Explicit out of scope

- SSH, chạy lệnh, reset/nạp lại, đổi role hay xóa dump/volume trên VPS (không có quyền; DEV-A A-04).
- Đổi giá trị mặc định `DB_*`, `pg-pool.ts`, `TransactionRunner` dùng chung với API/worker.
- Batch hóa các truy vấn của `LocalDemoAccountApi`/`AccountDirectoryService` (hai truy vấn đọc ngoài transaction, xem
  `## Behavior and design`): không cần cho bản sửa, chạm module `identity-access` dùng chung với `dev:seed`.

## Dependencies and blockers

- Không blocker cho phần code/test. **Còn mở: nguyên nhân gốc trên VPS chưa chứng minh**; [operator-verification](operator-verification.md)
  mục 1 là việc còn mở đó. Kiểm chứng trên VPS chờ Owner giao quyền; chưa có log gốc của lần chạy lại lỗi (không
  có trong repo BE/Docs), nên lần chạy nào trên VPS gặp đúng nhánh nào phải đối chiếu bằng
  [operator-verification](operator-verification.md) mục 1.

## Ownership: module, data, API

- `installation`: `public/demo-accounts.api.ts` (`describe`/`create` theo từng tài khoản), `public/installation.errors.ts`
  (thông điệp `DemoAccountsChangedError`).
- CLI: `src/cli/demo-dataset/demo-dataset-failure.ts` (mã nguyên nhân), `demo-dataset-runner.ts`, `demo-dataset.command.ts`.
- Infrastructure: `session-advisory-lock.ts` (`release` không ném).
- Test support: `test/support/pg-relay.ts` (`delay`). Bảng ghi: `app_users`, `password_credentials`, `role_grants`,
  `audit_events` như trước. HTTP/OpenAPI: không đổi.

## Behavior and design

**Nguyên nhân (bằng chứng: [evidence](evidence.md)).** Phân loại: **lifecycle/transaction của lệnh, bị hạ tầng khuếch đại**.

1. _Code._ Bước `org.accounts` mô tả 14 tài khoản demo trong **một** transaction tương tác (`TransactionRunner`, ngân sách
   `DB_TRANSACTION_TIMEOUT_MS` = 10 s) bằng các câu lệnh tuần tự theo từng tài khoản: 60 round trip khi chạy lại (đã đo),
   khoảng 165 khi ghi lần đầu (kế hoạch + 14 × 5 `INSERT` + kế hoạch lại). Thời gian của transaction = số câu × thời gian
   khứ hồi. Qua đường có độ trễ (SSH tunnel cách B) hoặc host quá tải, transaction vượt 10 s ⟹ Prisma `P2028` ⟹
   `TransientDatabaseError` ⟹ dòng `[LỖI] org.accounts … could not complete the transaction`, exit 1. Tái hiện được: chạy
   lại hỏng ở RTT 200 ms (2/2), lần nạp đầu hỏng ở RTT 200 ms và ở RTT 100 ms (đỏ của integration test), và cả khi nối
   thẳng lúc host bị tải nặng (transaction ghi bị cắt ở câu 89 sau 10 s).
2. _Hạ tầng._ Cảnh báo đúng chữ "A database connection was retired (client-side query timeout, or released inside a
   transaction)" chỉ in ra khi **một** câu lệnh không được trả lời trong `DB_QUERY_TIMEOUT_MS` (8 s): tunnel/mạng khựng,
   host bỏ đói tiến trình, hay câu đọc ngoài transaction bị khóa bởi DDL lúc deploy. Tái hiện bằng relay giữ một phản hồi
   9 s. Phần này không sửa bằng code: lệnh dừng an toàn (exit 1, không ghi dở trong transaction) và chạy lại đi tiếp.
3. _Đã loại trừ._ Pool không bị đóng trước pha sau (`app.close()` chỉ trong `finally` cuối lượt); khóa advisory nằm trên
   kết nối riêng, không giữ transaction, không đặt `statement_timeout` lên pool; nhận dạng dữ liệu đã có là đọc trước
   (không dựa vào insert lỗi); chạy lại lần 2, lần 3 ở môi trường trực tiếp đều exit 2.

**Sửa (code).**

- `DemoAccountsApi.describe`: mỗi tài khoản một transaction ngắn (đọc nhân viên, trạng thái tài khoản, id tài khoản: 8
  round trip). `create`: đọc kế hoạch cho cả danh sách; có xung đột/thiếu nhân viên ở đâu thì không ghi gì (như cũ); sau đó với
  từng tài khoản `absent`: hash Argon2id **trước** transaction, rồi một transaction đọc lại kế hoạch của tài khoản đó, so
  với lần đọc đầu (khác ⟹ `DemoAccountsChangedError`), ghi tài khoản + credential + grant + hai Audit, đọc lại. Một
  `correlationId` cho cả lượt như cũ. Số câu mỗi transaction không còn phụ thuộc cỡ fixture (test chặn ≤ 40 câu; đo được tối đa 18 round trip, 4 s ở RTT 200 ms trên host bận).
- Hệ quả có chủ đích: lượt dừng giữa chừng ở bước tài khoản giữ các tài khoản đã ghi (mỗi cái đủ credential, grant,
  Audit); chạy lại đọc chúng là `present` — đúng nguyên tắc "không transaction bao trùm, chạy lại đi tiếp" của lệnh. Thông
  điệp `DemoAccountsChangedError` nói đúng điều đó.
- `trySessionAdvisoryLock().release()` không bao giờ ném: kết nối khóa đã đứt thì server đã nhả khóa; trước đây lỗi của
  câu unlock thay cả báo cáo của lượt bằng `The demo dataset run failed: Error`.
- Báo cáo: bước `failed` và dòng lỗi cuối thêm mã nguyên nhân trong ngoặc vuông — mã Prisma (`P2028`), SQLSTATE nằm trong
  lỗi adapter (`P2010 57014`), mã socket (`ECONNRESET`) hoặc thông điệp cố định của node-postgres (`Query read timeout`);
  không bao giờ URL, giá trị, câu SQL hay stack.

Hai truy vấn đọc thoát khỏi transaction (`findAccountByLoginEmail`, `findLoginEmail` không nhận `tx`) vẫn dùng kết nối thứ
hai của pool trong lúc transaction mở: vô hại với pool 10 kết nối, ghi lại để không ai nhầm là nguyên nhân.

Migration, job, storage, HTTP: không áp dụng.

## Test matrix

| AC / rủi ro                       | Tình huống                                                                             | Cấp test    | Kết quả mong đợi                                                           | Bằng chứng sau implement                 |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Nạp lần đầu qua kết nối chậm      | RTT 100 ms (relay `delay(50)`), ngân sách 10 s                                         | integration | exit 0, đủ R1→R9; 14 tài khoản, 14 Audit; mỗi transaction ≤ 40 câu; 0 khóa | [evidence](evidence.md#integration-test) |
| Chạy lại lần 2 và lần 3           | cùng RTT 100 ms                                                                        | integration | exit 2 cả hai, mọi bước `present`, không ghi trùng, 0 khóa                 | như trên                                 |
| Kết nối khóa đứt giữa lượt        | `pg_terminate_backend` phiên giữ khóa sau khi lượt đã lấy khóa                         | integration | báo cáo giữ nguyên (exit 2), không `The demo dataset run failed`, 0 khóa   | như trên                                 |
| Mã nguyên nhân an toàn            | P2028, P2010+57014, `Query read timeout`, `ECONNREFUSED`, lỗi không phải database, URL | unit        | đúng mã; không lộ host/user/URL; lỗi khác không thêm gì                    | như trên                                 |
| Tái hiện CLI build thật trước/sau | production mode, runtime role H7, API thật; RTT 0/100/200 ms; một phản hồi khựng 9 s   | thủ công    | trước: hỏng ở 200 ms; sau: qua ở 200 ms; khựng 9 s vẫn exit 1 kèm mã       | [evidence](evidence.md#tái-hiện-cli)     |
| Hồi quy hạng mục gốc              | suite `demo-dataset` và `demo-dataset-calendar`                                        | integration | xanh như trước                                                             | như trên                                 |

Planned khác passed. Bằng chứng ghi lệnh, revision và môi trường, không chứa secret hay token.

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm — `n/a`; hành vi sửa
      có test đỏ-trước/xanh-sau (evidence).
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI —
      xem [plan](plan.md#verification-and-handoff) (không đổi HTTP).
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE — không đổi contract.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (VPS chưa chạy).

## Changes and acceptance

31/10/2026: chẩn đoán, sửa và hướng dẫn theo DEV-A A-04. Chưa commit, chưa chạy trên VPS, chưa Owner review: không có gì là
`accepted`.
