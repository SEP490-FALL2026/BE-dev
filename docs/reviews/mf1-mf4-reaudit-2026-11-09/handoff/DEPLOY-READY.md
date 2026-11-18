# DEPLOY-READY — MF-1, MF-4, MF-5 + Kho dùng chung (10/11/2026 ~06:50)

## Commit để deploy

- Repo `D:\FPT\FALL2026\Code\be-review`, nhánh **`fix/review-mf145`**, HEAD **`9b5ab488`**, cây sạch, **chưa push**.
- Đã chứa `origin/dev` (`1c41354e`) → PR vào `dev` không xung đột.
- Gồm: 6 nhánh sửa audit (G9-02, lịch sử Request, GH + Request tiếp tục, kho K4, ngân sách cơ sở, chạy luật MF-5), sửa tích hợp, seed demo v4,
  và 3 commit cuối:
  - `4c0e26d3` chạy luật thủ công (`POST /ghost-seat-rule-runs`) đưa khuyến nghị vào hàng chờ trưởng phòng ngay (trước đây phải đợi job mỗi giờ).
  - `2d76dc06` test seed theo dữ liệu v4.
  - `9b5ab488` khung test flows chạy được trên dữ liệu v4.
- API: 381 operation, `openapi.json` không đổi so với bản tài liệu FE (Docs `6c4ca7f`, pin `379dc011`).

## Đã kiểm (máy local, sau khi gộp seed)

| Kiểm | Kết quả |
| --- | --- |
| `typecheck`, `format:check`, `arch:check`, `rules:check` | xanh |
| `test:gates` + unit fixture seed | 151/151 xanh |
| `seed*.integration-spec` (seed, calendar, bootstrap, rerun) | 4 file xanh |
| `pnpm check` (unit 5414, gates 331, lint…) | xanh ở `92f7caad` (trước khi gộp seed); chỉ `test:scripts` đỏ do CRLF trên Windows |
| `test:http` | xanh ở lượt tích hợp |
| Full integration / e2e | không chạy lại theo Owner — **để CI GitHub chạy** |

## Owner làm

1. Push và mở PR vào `dev`, CI chạy đủ suite:
   ```bash
   cd D:/FPT/FALL2026/Code/be-review
   git push -u origin fix/review-mf145
   ```
   CI đỏ → gửi log cho chat review sửa.
2. CI xanh → merge `dev` → `main` (đúng repo bạn vẫn deploy) → job **Deploy to VPS** chạy sau CI của `main`
   (migrate deploy + role reconcile nằm trong `deploy-release.sh`).
3. Seed lại VPS (bắt buộc reset vì v4 khác v3; script tự dump backup trước khi xóa) — theo `docs/guides/seed.md` mục "VPS demo đã có release mới":
   ```bash
   scp scripts/ops/seed.sh .env.seed.example <demo-host>:/opt/slm/backend/   # từ checkout đúng commit đã deploy
   # trên VPS: .env.seed có SEED_ALLOW_RESET=true, chmod 600
   bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed --confirm-reset <POSTGRES_DB>
   bash /opt/slm/backend/seed.sh --app-dir /opt/slm/backend --config /opt/slm/backend/.env.seed --continue   # mong đợi exit 2
   ```
   Không chạy seed trong lúc job deploy đang chạy (khóa deploy).
4. Sau deploy: trong Docs `Figma UI-UX/API-Integration/README.md` đổi sha sang commit đã deploy và gỡ ghi chú "chưa deploy".
5. Tài khoản demo: bảng trong `src/cli/seed/fixture/shared-demo-v4/README.md` (mật khẩu = `SEED_DEMO_ACCOUNT_PASSWORD`).
   Demo MF-5 trong ngày: Super Admin đặt `GHOST_SEAT_REVOCATION_GRACE_DAYS=0` (PUT `/api/v1/operating-parameters/{key}`), IT Admin bấm chạy luật.

## Còn lại (không chặn deploy)

- **Test flows (`pnpm test:flows`) — 33/69 đỏ trên dữ liệu v4.** Các kịch bản viết cho người/phòng/thuê bao của v3. **CI không chạy flows**
  (`ci.yml`: quality, http, integration, integration-inband, e2e), nên không chặn deploy. Viết lại flows theo v4 → đợt sau.
- `_serial/seed-check-runtime` (đổi tên v3→v4) chưa chạy local vì cần superuser PostgreSQL — CI `integration-inband` sẽ chạy.
- Luồng phụ để đợt MF-2/MF-3: hóa đơn SBF-19, chi phí seat-tháng, nhắc việc, thiết bị khóa K4, điều chỉnh thuê bao (`AUDIT-FINAL.md`).
- Quyết định mở trước 15/12: job 01/01 khi chưa có tỷ giá ngày 01/01 (đề xuất: giữ năm mở, thử lại mỗi ngày).
- Thư mục `D:\FPT\FALL2026\Code\be-seed` đã gỡ khỏi git nhưng Windows không cho xóa (đang mở trong chat/VS Code): đóng chat seed rồi xóa tay.
