# SEED-REPORT — data seed demo v4 (MF-1, MF-4, MF-5 và Kho dùng chung)

- Nhánh: `feat/seed-v4` (worktree `D:\FPT\FALL2026\Code\be-seed`), tách từ `379dc011`. Không push, không merge `dev`, không deploy; chỉ DB local `slm_smoke` (container Docker `slm-test-db`, cổng 55432).
- Commit: `feat(seed): demo v4 theo MF-1, MF-4, MF-5 và kho dùng chung` (`24d38e97`).
- Fixture: `src/cli/seed/fixture/shared-demo-v4/` (README có bảng tài khoản, bảng dữ liệu theo từng MF và kịch bản demo vai → màn → API).

## Skill đã dùng

`context-engineering` (nạp context theo tầng: spec, plan, code, API thật), `project-config` (tra cứu lệnh, cổng, env trước khi chạy), `tdd-skill` (unit cho fixture/bước/ngày; kiểm trên stack thật khi unit không chạm tới), `git-sync` (nhánh riêng, không commit lên main/dev, không push). Không có skill `superpowers:*` trong phiên này nên dùng skill gần nhất cho vai verification là `tdd-skill` (xác minh trên stack thật) cộng các lệnh kiểm tra bên dưới.

## Việc Owner cần làm một lần (bắt buộc để chốt)

Prisma từ chối `migrate reset` khi chạy bởi AI (`Prisma Migrate detected that it was invoked by Claude Code`), nên **tôi dừng ở đây và nhờ Owner reset tay**, theo đúng chỉ dẫn. Lý do cần reset: DB local đang giữ vài bản ghi từ các lượt thử trước khi sửa fixture (phiên bản ngân sách Pháp chế có cơ sở 0, nên R13 bị trả về; còn một nhân viên NV-MOV1 đã bỏ khỏi fixture). Reset dựng lại từ đầu bằng fixture cuối.

```powershell
# dừng pnpm start:dev và start:worker nếu đang chạy, rồi:
cd D:\FPT\FALL2026\Code\be-seed
pnpm seed:local        # gõ đúng tên database: slm_smoke
```

Lượt đầu kéo dài hơn vài phút vì bước cuối chờ job theo dõi hàng chờ (chạy lượt đầu 6 phút sau khi API khởi động) mới đưa khuyến nghị vào hàng chờ của trưởng phòng. Kết quả mong đợi: mã thoát 0; chạy lại `pnpm seed:local --continue` mã thoát 2.

## Lệnh và kết quả thật

| Lệnh | Kết quả |
| ---- | ------- |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm format:check` | exit 0 |
| `pnpm arch:check` | exit 0 |
| `pnpm rules:check` | exit 0 (606 file, 0 lỗi) |
| `pnpm test:gates` | 331/331 xanh |
| `jest src/cli/seed` (+ `demo-accounts.api.spec`, `session-advisory-lock.spec`) | xanh (fixture, bước, ngày, đường kịch bản, runner, đối số, bí mật) |
| `node --test scripts/verify/seed-local.test.mjs scripts/verify/seed.test.mjs` | 38/38 xanh |
| `pnpm seed:local --confirm-reset slm_smoke` | **bị Prisma chặn** (xem trên) |
| `pnpm seed:local` / `--continue` trên DB đã có (10 lượt, sửa dần) | lượt cuối: toàn bộ bước `ĐÃ CÓ`/`ĐÃ GHI`, trừ R13 (do DB cũ, cần reset) |

Chưa chạy: `pnpm check` và toàn bộ suite (đúng yêu cầu: Owner chạy khi audit); integration `seed*.integration-spec` và flow (cần Docker/Postgres test, ngoài phạm vi lượt này).

## Đã xác nhận trên stack thật (API, đăng nhập từng vai)

- Tổ chức: 9 phòng + ADMIN, 8 trưởng phòng MANAGER, Pháp chế không có trưởng phòng, Vận hành không có Cost Center; 1 Finance, 1 Người duyệt chi, 2 IT Admin, 27 tài khoản đúng một vai.
- Ngân sách năm: 8 phòng có Cost Center, phiên bản đã duyệt (ENG 600M, MKT 240.000, DES 280.000, SAL 290.000, BOD/FIN/ITO 50M, LGL số liệu nền). Kỳ năm sau `PUBLISHED` Trần 500M; ENG đề xuất 5 dòng (RENEW/CHANGE/NEW×2/CANCEL) với 2 dòng cờ vượt Trần (2.000.000 và 10.000.000); MKT phiên bản `SENT`; SAL `CHANGES_REQUESTED`; ITO đề xuất chờ Finance.
- MF-1: hàng nhu cầu NV-ENGH có R03; hàng trình lô R07; DES: R21 `USES_RESERVE` chưa xác nhận; CEO thấy R02 (trong số cơ sở), R10 (dùng dự phòng đã xác nhận), R12 (trưởng phòng tự gửi, một bước); R11 `BLOCKED OVER_RESERVE`; hàng cấp của IT: R22 (cấp được từ kho), R15 (kho 1Password hết), R20 (kho khóa DataGrip hết), R06 (K5); R08/R25 chờ thẩm định; R16 còn 20 ngày; bản nháp OPS1.
- MF-5: luật chạy ra 7 khuyến nghị G1, 3 G2 (NV-OFF1), 1 G3 (NV-DES3), 5 G4 (DES1, DES2 Action, DES11, DES12, DESH); các ghế bẫy bị bỏ qua đúng cổng; 1 định danh chưa khớp. Sau quyết định của NV-DESH: DES2 Giữ, DES11 Thu hồi (tác vụ thu hồi `notBefore` = D0+7), DES12 Miễn trừ 90 ngày, DESH tự quyết (Super Admin thấy 1 quyết định tự quyết); hàng chờ còn DES1 và DES3.

## Bảng tài khoản (không mật khẩu)

Mật khẩu: Super Admin `SEED_SUPER_ADMIN_PASSWORD`, mọi tài khoản demo `SEED_DEMO_ACCOUNT_PASSWORD` (đọc từ `.env.seed.local`, không ghi vào repo).

| Mã | Họ tên | Email đăng nhập | Vai | Phòng | Trưởng phòng của |
| -- | ------ | --------------- | --- | ----- | ---------------- |
| NV-CEO | Nguyễn Văn An | an.nguyen@saoviet.example | SPENDING_APPROVER | BOD | - |
| NV-DEP | Trần Thị Bích | bich.tran@saoviet.example | MANAGER | BOD | BOD |
| NV-ENGH | Lê Minh Cường | cuong.le@saoviet.example | MANAGER | ENG | ENG |
| NV-DEV1 | Phạm Thu Dung | dung.pham@saoviet.example | EMPLOYEE | ENG | - |
| NV-DEV2 | Hoàng Văn Em | em.hoang@saoviet.example | EMPLOYEE | ENG | - |
| NV-DEV3 | Vũ Thị Giang | giang.vu@saoviet.example | EMPLOYEE | ENG | - |
| NV-DEV4 | Lương Hoàng Phi | phi.luong@saoviet.example | EMPLOYEE | ENG | - |
| NV-OFF1 | Hà Văn Nam | nam.ha@saoviet.example | EMPLOYEE | ENG | - |
| NV-CTR1 | Vũ Quốc Phong | phong.vu@saoviet.example | EMPLOYEE | ENG | - |
| NV-INT1 | Đặng Quốc Huy | không tài khoản | - | ENG | - |
| NV-DESH | Bùi Ngọc Khánh | khanh.bui@saoviet.example | MANAGER | DES | DES |
| NV-DES1 | Đỗ Thị Lan | lan.do@saoviet.example | EMPLOYEE | DES | - |
| NV-DES2 | Ngô Văn Mạnh | manh.ngo@saoviet.example | EMPLOYEE | DES | - |
| NV-DES3 | Trương Thị Hoa | hoa.truong@saoviet.example | EMPLOYEE | DES | - |
| NV-DES4 | Nguyễn Anh Khôi | không tài khoản | - | DES | - |
| NV-DES5 | Phan Thị Linh | không tài khoản | - | DES | - |
| NV-DES6 | Lê Thanh Mai | không tài khoản | - | DES | - |
| NV-DES7 | Trần Quang Nhật | không tài khoản | - | DES | - |
| NV-DES8 | Võ Thị Hà | không tài khoản | - | DES | - |
| NV-DES9 | Đinh Văn Oanh | không tài khoản | - | DES | - |
| NV-DES10 | Mai Thị Phượng | không tài khoản | - | DES | - |
| NV-DES11 | Hồ Văn Quý | không tài khoản | - | DES | - |
| NV-DES12 | Cao Thị Sương | không tài khoản | - | DES | - |
| NV-FINH | Phan Thị Ngọc | ngoc.phan@saoviet.example | MANAGER | FIN | FIN |
| NV-FIN1 | Trịnh Văn Phúc | phuc.trinh@saoviet.example | FINANCE | FIN | - |
| NV-ITOH | Trần Minh Thanh | thanh.tran@saoviet.example | MANAGER | ITO | ITO |
| NV-ITA1 | Lý Minh Quân | quan.ly@saoviet.example | IT_ADMIN | ITO | - |
| NV-ITA2 | Mai Thị Rạng | rang.mai@saoviet.example | IT_ADMIN | ITO | - |
| NV-MKTH | Đinh Thị Uyên | uyen.dinh@saoviet.example | MANAGER | MKT | MKT |
| NV-MKT1 | Lâm Văn Vinh | vinh.lam@saoviet.example | EMPLOYEE | MKT | - |
| NV-MKT2 | Châu Thị Xuân | xuan.chau@saoviet.example | EMPLOYEE | MKT | - |
| NV-SALH | Trương Văn Yên | yen.truong@saoviet.example | MANAGER | SAL | SAL |
| NV-SAL1 | Kiều Thị Ánh | anh.kieu@saoviet.example | EMPLOYEE | SAL | - |
| NV-SAL2 | Quách Văn Bảo | bao.quach@saoviet.example | EMPLOYEE | SAL | - |
| NV-LGL1 | Lý Thu Thủy | thu.ly@saoviet.example | EMPLOYEE | LGL | - |
| NV-OPSH | Quan Thị Trang | trang.quan@saoviet.example | MANAGER | OPS | OPS |
| NV-OPS1 | Tạ Văn Sơn | son.ta@saoviet.example | EMPLOYEE | OPS | - |
| NV-NEW1 | Hồ Thị Tâm | không tài khoản | - | OPS | - |
| NV-SA | Quản trị hệ thống | system.admin@saoviet.example (hoặc SEED_SUPER_ADMIN_EMAIL) | SUPER_ADMIN | ADMIN | - |

## Mục dữ liệu chưa tạo được và vì sao

| Mục | Lý do | Cách xử lý |
| --- | ----- | ---------- |
| Điều chuyển hiệu lực hôm nay (ghế "tạm dừng" của MF-5) | Nhân viên tạo hôm nay được xếp phòng từ hôm nay; API chặn điều chuyển cùng ngày (`DEPARTMENT_TRANSFER.EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD`) | Bỏ NV-MOV1 khỏi fixture; ghi trong README. Demo điều chuyển với ngày hiệu lực ngày mai |
| Request nhóm chờ duyệt nhu cầu | Nhóm chỉ do trưởng phòng gửi nên không có bước nhu cầu | R14 (đã cấp) và R26 (chờ trình lô) |
| Hóa đơn mua hàng, điểm điều chỉnh/cảnh báo đỏ/đóng thuê bao, quyền theo vai, thiết bị đăng ký cho khóa K4, `KPI-4` | Code hiện hành chưa có API tương ứng (`openapi.json` 381 operation không có); K4 gán khóa không nhận thiết bị | Bỏ các dòng DM1/DS20 phụ thuộc; không lách bằng SQL |
| Khuyến nghị G4 mức theo dõi (NV-DES4, 40 ngày) | Luật không sinh khuyến nghị dưới ngưỡng xem xét | Giữ làm ca "chỉ ghi nhận" |
| Quyết định của trưởng phòng ngay trong lượt seed đầu | Khuyến nghị vào hàng chờ trưởng phòng chỉ khi job theo dõi chạy (6 phút sau khi API khởi động), không có route chạy tay | Bước `ghost.decisions` tự chờ tới 9 phút |

## TẠM CHỌN

1. **9 phòng** thay vì 5–7: cần hai phòng đặc biệt tách biệt (Pháp chế không trưởng phòng nhưng có Cost Center và ngân sách để demo "một bước"; Vận hành có trưởng phòng nhưng không Cost Center để demo "chỉ lưu nháp") cộng Ban Giám đốc, Tài chính, CNTT. Bỏ được thì mất ca một bước có ngân sách.
2. **Thay hẳn v3 bằng v4** (không giữ song song): v3 viết cho mô hình cũ (thuê bao theo phòng sở hữu, Finance ghi hóa đơn, `termMonths`) nên không dựng được trên code mới. Các tệp test trỏ `shared-demo-v3` đã đổi sang `shared-demo-v4`; assertion phụ thuộc dữ liệu cũ (R1…R11, `finance.invoices`) do chat review sửa khi gộp.
3. **Năm hiện tại: mọi phòng có Cost Center đều có phiên bản đã duyệt** (theo yêu cầu lượt này), khác thiết kế W7 cũ (DES bị yêu cầu sửa). "Bị yêu cầu sửa" nằm ở năm sau (SAL).
4. **MKT 240.000, DES 280.000, SAL 290.000** và các Request R10/R21/R11 kết thúc cuối tháng (đúng một tháng) để ba kết quả kiểm ngân sách không phụ thuộc ngày chạy; mỗi phòng này không có Request nào khác giữ/chờ ngân sách.
5. **Ghế nền cấp 130 ngày trước**, mọi nhân viên vào làm 400 ngày trước; mọi mốc usage tính từ ngày chạy.
6. Số liệu nền của Pháp chế lấy từ ghế Jira/GitHub/Postman của NV-LGL1 (ngân sách nền ≠ 0 để R13 vào được bước duyệt chi).
7. K1 (ChatGPT, Cursor) buộc nêu phòng sở hữu (`SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE` nếu thiếu): gắn Kỹ thuật; K2 và K4 không thuộc phòng nào.
8. Khai nguồn usage Figma, Jira bằng CSV mẫu (`email`, `last_activity_date`), thông báo theo dõi lần đầu do IT xác nhận đã gửi; Canva cố ý quá cũ.
9. Dữ liệu vận hành: tham số `GHOST_SEAT_REVOCATION_GRACE_DAYS` và `RULE_SCHEDULE_G3_G4` **không** do seed đặt (giữ mặc định 7 ngày ân hạn để có ca "đã Thu hồi, đang trong ân hạn"); README hướng dẫn Super Admin đặt khi muốn demo trong ngày.

## Ghi chú cho chat review

- Thay đổi ngoài fixture: `demo-api-client.ts` thêm `upload` (multipart) và header tùy chọn (cho tệp CSV và `Idempotency-Key`); `demo-dates.ts` mới; bước tách theo miền (`baseline`, `budget`, `assets`, `usage`, `personnel`, `finance-kit`); đổi tên v3 → v4 ở các tệp test/integration/flow và `docs/guides`.
- `ghost.decisions` chờ tối đa 9 phút nên integration `seed.integration-spec` (nếu chạy apply thật) cần đồng hồ/cách đẩy job hoặc chấp nhận bước này `conflict` khi job không chạy; đề xuất xử lý khi gộp.
- `pnpm seed:local` lần đầu trên máy mới cần `CREATE DATABASE slm_smoke` (tôi đã tạo trong container `slm-test-db`).
