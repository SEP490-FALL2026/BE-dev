# Runbook chạy đêm — finance-screens-api

Vai trò (Owner chốt 06/11/2026):

- **Chat code** — một **phiên Claude Code riêng** do Owner mở bằng [CODER-PROMPT.md](CODER-PROMPT.md). Chỉ viết code theo [plan](plan.md),
  chạy quick set, ghi `HANDOFF.md`, rồi báo bằng `SendMessage` (`TASK Tn DONE`, `FIX-n DONE`, `ALL DONE`). Vòng sửa: điều phối gửi
  `FIX ...` lại cho chính phiên này. Không dùng subagent cho phần code.
- **Chat điều phối** — phiên `SEP-Start 70: code Finance` (chat đã viết spec). Không viết code tính năng. Nhận báo cáo, review/verify/audit, gửi danh sách sửa, chạy test
  toàn bộ, test API thật trên dữ liệu thật, cập nhật mô tả API cho FE.
- **Owner** — sáng hôm sau commit, cập nhật Docs (QĐ cho D1/D2), deploy.

## Điều kiện bắt đầu

1. Owner nhắn **"start"** sau khi mọi chat Đợt 1 đã dừng (cùng nhánh, cùng file).
2. Docker Postgres/Redis đang chạy; `.env` trỏ DB local.
3. Chế độ quyền cho phép Edit/Bash không cần bấm duyệt.

## Các bước

1. **Baseline** (điều phối): `git status`, quick set trên nhánh hiện tại → `BASELINE.md` (đỏ sẵn có thì ghi lại, không tính cho hạng mục).
2. **Code** (`finance-coder`): T1 → T2 → T5 → T3 → T4 → T6 theo plan; quick set sau mỗi task; báo cáo vào `HANDOFF.md`
   (file sửa, lệnh + kết quả thật, `DEVIATIONS`).
3. **Audit** (điều phối), đối chiếu [spec](spec.md) + Docs (`C-08`, `C-09`, `C-16`, `SBF-11a`, `QĐ-34b`, `QĐ-97d`):
   - một reviewer nền mới (không xem lý giải của coder) đọc toàn bộ diff so với spec → `REVIEW.md`;
   - điều phối tự đọc: migration, SQL thô, quyền (`RequireRoles`, `readable`), khóa/ghi đồng thời, `CommitmentRepo.totals` và chỗ
     kiểm tra ngân sách dùng nó, mọi test/gate bị sửa;
   - finding → gửi `finance-coder` sửa → kiểm lại. Tối đa 3 vòng; còn lại ghi vào REPORT là chưa xong.
4. **Test toàn bộ** (điều phối): `pnpm check`, `pnpm test:http`, integration, e2e (gồm `test:flows` nếu có), timing, serial. Lỗi do tải
   DB ⟹ chạy lại concurrency thấp. Lỗi thật ⟹ quay lại bước 3.
5. **API thật, dữ liệu thật** (điều phối): migrate DB đã có dữ liệu demo, nạp seed demo hiện hành, chạy server local, đăng nhập
   tài khoản Finance demo, gọi lần lượt màn 1 → 3 → 4+5 (ghi một hóa đơn khớp, một có thuế, một vượt) rồi xem lại màn 1 và kiểm
   tra ngân sách của một Request sau hóa đơn. Ghi request/response rút gọn vào `SMOKE.md`. Kiểm 403 với tài khoản không phải Finance.
6. **Mô tả API cho FE** (điều phối): sinh lại `Docs/Figma UI-UX/API-Integration` bằng `tools/build-api-docs.mjs` từ **bản sao** của
   working tree BE (không chạy generator trên workspace), thêm flow `flows/finance-screens.md` (bảng FE mapping trong plan),
   changelog `changes/2026-11-07-finance-screens.md`, ghi rõ _nhánh `feat/qd96-100-alignment`, chưa commit, chưa deploy_.
   6b. **Seed** (song song với bước 6): gửi `finance-coder` làm T7 trong plan; điều phối audit T7, chạy seed local (`pnpm seed:local`
   nếu dựng được) rồi lặp lại smoke bước 5 trên dữ liệu seed.
7. **REPORT.md**: việc đã xong, lệnh + kết quả, finding và cách sửa, phần chưa làm, việc của Owner.
8. **Commit/push** (Owner cho phép 06/11/2026):
   - BE: chat Đợt 1 đã tự commit phần của nó trước khi `start`; điều phối commit **chỉ** thay đổi của hạng mục này (một hoặc vài
     commit có nghĩa), push `feat/qd96-100-alignment`, mở PR vào `dev`, **không** merge.
   - Docs: commit **chỉ** các file trong `Docs/Figma UI-UX/API-Integration/` do điều phối sửa; push nhánh hiện tại của Docs.
   - Chỉ commit khi test toàn bộ xanh (hoặc mọi đỏ còn lại đã được chứng minh là logic cũ Đợt 1 / lỗi môi trường, ghi trong REPORT).

## Luật cho agent

- Không commit, push, reset, checkout, stash; không đụng thay đổi của Đợt 1 ngoài phạm vi plan.
- Không nới test/gate để cho qua; test cũ đỏ không liên quan ⟹ ghi lại.
- Không tự đổi nghiệp vụ; spec không nói ⟹ chọn cách đơn giản nhất, ghi vào `DEVIATIONS`.
- **Logic cũ Đợt 1 giữ để demo 07/11 — không sửa** (spec `## Logic cũ của Đợt 1`). Chỉ ghi vào REPORT mục _Logic cũ còn lại_.
  Audit cũng **không** tính các chỗ đó là finding phải sửa, trừ khi hạng mục này làm chúng sai thêm (vd. `heldOf`).
- Test cũ đỏ vì logic cũ Đợt 1 ⟹ ghi lại kèm tên test, không sửa test, không sửa code để test xanh.

## Trạng thái

| Bước           | Trạng thái | Ghi chú |
| -------------- | ---------- | ------- |
| 1 Baseline     | —          |         |
| 2 Code         | —          |         |
| 3 Audit        | —          |         |
| 4 Test toàn bộ | —          |         |
| 5 API thật     | —          |         |
| 6 FE docs      | —          |         |
| 7 Report       | —          |         |
