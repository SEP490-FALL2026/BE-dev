# Seed lại VPS demo sau Đợt 1 (06/11/2026) — Owner thực hiện

Dùng script có sẵn `scripts/ops/seed.sh` (chi tiết: [docs/guides/seed.md](../../../guides/seed.md) mục _VPS demo đã có release mới_
và _Các lần sau_). Script làm trọn một lượt, **không phải setup tay**: dump DB → dừng API/worker → DROP/CREATE đúng database trong
container → provision role (`db-admin`) → áp migration → reconcile role → khởi động API/worker → seed qua API. Container, volume,
`.env`, Caddy, user PostgreSQL, image đều giữ nguyên; chỉ nội dung database được làm mới. Không xóa tay bảng/schema — các bảng có
trigger chặn TRUNCATE/DELETE và quyền H7 theo role, xóa tay dễ để lại DB nửa vời.

VPS hiện đang chứa dataset cũ (tổ chức `SLM Demo`), nên `apply` thường sẽ từ chối "tổ chức khác" — bắt buộc đi đường reset.

## 0. Trước khi làm

- Bản Đợt 1 đã commit (không gồm `docs/workspace/items/finance-screens-api/`), CI xanh, CD đã deploy xong (API ready). Ghi lại sha.
- Không chạy deploy CI/CD khác trong lúc seed (script giữ `releases/.deploy.lock`; deploy tới giữa chừng sẽ dừng exit 2).

## 1. Chép script đúng commit đã deploy (máy Owner)

```bash
git checkout <sha đã deploy>
scp scripts/ops/seed.sh .env.seed.example <demo-host>:/opt/slm/backend/
```

## 2. Cấu hình trên VPS

```bash
cd /opt/slm/backend
[ -f .env.seed ] || cp .env.seed.example .env.seed
chmod 600 .env.seed
nano .env.seed
```

Điền (không dấu nháy, không khoảng trắng thừa):

```
SEED_OPERATOR_REFERENCE=dot1-reseed-2026-11-06
SEED_SUPER_ADMIN_PASSWORD=<12–128 ký tự, khác email>
SEED_DEMO_ACCOUNT_PASSWORD=<12–128 ký tự — mật khẩu chung của 21 tài khoản demo>
SEED_SUPER_ADMIN_EMAIL=            # để trống ⟹ system.admin@saoviet.example
SEED_ALLOW_RESET=true
```

Lấy tên database đang chạy: `grep '^POSTGRES_DB=' /opt/slm/backend/.env`.

## 3. Reset + seed (một lệnh)

```bash
bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed --confirm-reset <POSTGRES_DB>
```

Không có `--confirm-reset` thì script in tên DB + số đếm và hỏi gõ đúng tên database (Enter = thoát). Mã thoát: `0` xong; `2` không còn
gì cần ghi; `3` bị từ chối trước khi ghi (đọc dòng `refused:`); `4` xung đột dataset; `1` lỗi. Báo cáo: `seed-reports/<UTC>-apply.txt`.
Dump trước khi xóa nằm ở `backups/postgres/slm-pre-reseed-<UTC>.dump`.

Đúng: báo cáo có 24 dòng `[ĐÃ GHI]`, tổ chức "Công ty Cổ phần Công nghệ Sao Việt", ngân sách ENG/MKT/SAL năm nay và năm sau, R1…R9.

## 4. Kiểm sau seed

- Đăng nhập `system.admin@saoviet.example` (hoặc email đã điền) bằng `SEED_SUPER_ADMIN_PASSWORD` ⟹ `/me.roles = ["SUPER_ADMIN"]`.
- Đăng nhập 3–4 tài khoản bằng `SEED_DEMO_ACCOUNT_PASSWORD`: `an.nguyen@` (Người duyệt chi), `phuc.trinh@` (Finance), `quan.ly@` (IT Admin),
  `cuong.le@` (trưởng phòng ENG), `em.hoang@` (nhân viên ENG) — đuôi `@saoviet.example`. Danh sách đủ: README fixture
  `src/cli/seed/fixture/shared-demo-v3/README.md`.
- Chạy lại bước 3 với `--continue` (không `--confirm-reset`) ⟹ exit `2`.
- Sau seed, đổi `SEED_ALLOW_RESET=false` để tránh reset nhầm.

## 5. Khi lỗi

Giữ nguyên trạng thái, gửi output + file trong `seed-reports/`. Lỗi sau DROP và trước khi API ready: script in lệnh phục hồi dump — làm
theo đó (xem mục _Phục hồi khi có dump_ trong `docs/guides/seed.md`). Không reset lần nữa trước khi xem nguyên nhân.

## Gợi ý kịch bản demo trên dữ liệu này

- Request trả phí: nhân viên ENG/MKT/SAL (có ngân sách năm nay + năm sau) ⟹ đi thẳng tới duyệt chi, thời hạn 1–12 tháng.
- Finance rà soát: R9 hoặc Request phòng Thiết kế (DES không có ngân sách — cố ý).
- Điều chỉnh thuê bao: Jira Standard của ENG — IT Admin `quan.ly@` đề xuất giảm kèm seat thu hồi, trưởng phòng ENG `cuong.le@` xác nhận.
- Nghỉ việc / điều chuyển: Super Admin ghi hồ sơ với căn cứ (ngày ban hành ≤ hôm nay), chọn chặn ngay hoặc chặn hết ngày cuối.
- G7: đăng ký máy + BM-06 + nhân viên xác nhận + mã đăng ký chạy live trên VPS (seed không có thiết bị); tool `be-enroll` cần URL VPS.
