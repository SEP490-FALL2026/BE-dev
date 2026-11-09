# Ba chat code song song (Cursor hoặc Claude Code) — MF-1 + MF-4

Thay cho `CODER-PROMPT.md` khi chạy song song. Mỗi chat làm trong **thư mục riêng** (git worktree) để không trộn thay đổi chưa commit của nhau.

## 0. Chuẩn bị (Owner chạy một lần, Git Bash, tại thư mục BE)

```bash
cd /d/FPT/FALL2026/Code/BE-dev-software-license-management
git worktree add -b feat/mf1-core  ../be-mf1-core  c21eea94
git worktree add -b feat/mf1-grant ../be-mf1-grant c21eea94
cp .env ../be-mf1-core/.env && cp .env ../be-mf1-grant/.env
(cd ../be-mf1-core && pnpm install) && (cd ../be-mf1-grant && pnpm install)
```

| Chat | Mở Cursor tại thư mục                                     | Nhánh                  | Gói (PLAN §1)                                                             |
| ---- | --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| A    | `D:\FPT\FALL2026\Code\be-mf1-core`                        | `feat/mf1-core`        | 2 → 3 → 4 → 7 → 8 (MF-1 lõi: tiền, kiểm ngân sách, cam kết, một bước, GH) |
| B    | `D:\FPT\FALL2026\Code\BE-dev-software-license-management` | `feat/qd103-108-mf145` | 1 → 5 → 6 (MF-4)                                                          |
| C    | `D:\FPT\FALL2026\Code\be-mf1-grant`                       | `feat/mf1-grant`       | 9 → 10 → 11 (cấp từ kho, hóa đơn `SBF-19`, Request tiếp tục)              |

Ghép nhánh: chat A **merge `feat/qd103-108-mf145` vào nhánh mình trước gói 3** (gói 3 cần gói 1). Chat C merge `feat/mf1-core` trước phần
_giải phóng cam kết_ của gói 9 và trước gói 10, 11 (cần gói 2, 3). Cuối cùng chat review ghép A và C vào `feat/qd103-108-mf145`. Integration test
dùng DB tạm riêng mỗi lần chạy nên chạy song song được; Docker phải sống.

Gói tiếp theo khi một chat xong phần của mình (chat tự làm, không chờ Owner giao): **A → 12** (API theo dõi Request; trước đó
`git merge feat/mf1-grant` để có gói 11) · **C → 13** (`K4`) · **B → 14** (quyền theo vai; trước đó merge `feat/mf1-core` và `feat/mf1-grant`
để có gói 8, 9). Gói 15 (tài liệu FE + seed demo) do chat review làm khi ghép nhánh.

## 1. Prompt chung (dán vào mỗi chat, thay `<X>`, `<GÓI>`, `<VÙNG>`)

```text
Bạn là chat code <X> sửa BE SaaS-Sentry cho đúng MF-1/MF-4. Trả lời tiếng Việt.

Đọc: AGENTS.md, ARCHITECTURE.md, docs/rules/README.md; rồi
docs/reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md (§4 phần gói của bạn, §6 quyết định, §8 ranh giới) và PLAN.md (§2 quy trình, §4 việc riêng
từng gói). Mỗi gói: đọc spec.md + plan.md của hạng mục PLAN §1 ghi, áp delta SPEC §4 lên trên (delta thắng).

Gói của bạn, làm tuần tự: <GÓI>. Vùng code chính: <VÙNG>. Chỉ sửa ngoài vùng khi gói bắt buộc (khai báo module, enum thông báo,
openapi.json, migration) và ghi rõ trong HANDOFF.

Quy tắc:
- Thư mục và nhánh hiện tại là của riêng bạn. Không checkout nhánh khác, không stash/reset thay đổi không phải của bạn.
- SPEC §4b (sửa sau review độc lập) THẮNG mọi chỗ khác — đọc nó trước khi làm mỗi gói.
- Cuối mỗi gói chạy quick check đúng như PLAN §2 bước 3 (typecheck, lint, format:check, arch:check, arch:docs:check, rules:check, prisma:validate,
  test:gates, test:discovery, openapi:export) rồi test theo file đã đổi. Không chạy pnpm check/toàn bộ suite.
- Test mới đặt tên theo mã luật (vd. 'BR-MF1-06b: …').
- Commit mỗi gói (gói lớn: mỗi phase): feat(mf1-mf4): <gói> — <tóm tắt>. KHÔNG push, KHÔNG merge vào dev, KHÔNG sửa repo Docs.
- Sau mỗi gói ghi một dòng vào docs/reviews/mf1-mf4-reaudit-2026-11-09/HANDOFF-<X>.md: giờ · gói · commit · lệnh đã chạy + kết quả thật ·
  lệch SPEC · việc để lại. Làm tiếp gói sau, không chờ review. Review chạy song song; khi Owner/chat review dán "FIX <gói>: …" thì làm FIX
  đó trước khi sang gói kế.
- Chi tiết kỹ thuật không có trong SPEC (tên biến, cấu trúc file, thông báo lỗi…): tự chọn, ghi TẠM CHỌN trong HANDOFF, làm tiếp. Còn LUẬT
  NGHIỆP VỤ ảnh hưởng tiền/quyền/người duyệt mà SPEC/Docs không có: dừng gói đó, ghi câu hỏi vào HANDOFF, chuyển sang phần khác không phụ thuộc.
- Docker không chạy: làm phần unit/code, ghi "integration chưa chạy — Docker"; gói chỉ coi là XONG khi integration của gói đã chạy xanh.
- Tối thiểu đúng luật, không thêm tính năng ngoài SPEC, không refactor ngoài gói.
<THÊM>
```

| Chat | `<GÓI>`       | `<VÙNG>`                                                                                                           | `<THÊM>`                                                                                                                                                                                                                                          |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | 2, 3, 4, 7, 8 | `src/modules/requests/**`, phần định giá ở `src/modules/catalog/{subscription,requestable-software}`               | Trước gói 3: `git merge feat/qd103-108-mf145` (cần gói 1 của chat B đã commit — xem HANDOFF-B.md; chưa có thì làm gói 7 phần không đụng kiểm ngân sách trước). Gói 3 không xong ⟹ không coi là xong khi gói 4 chưa xong (hạn 01/01).              |
| B    | 1, 5, 6       | `src/modules/budgets/**` (trừ `commitment/` — của chat A ở gói 3)                                                  | Gói 1 xử lý 12 file chưa commit đang có trong thư mục này; commit gói 1 sớm nhất có thể vì chat A chờ. Gói 6 cần định nghĩa _Request đang chờ duyệt chi_ của gói 3: làm gói 5 trước, gói 6 sau khi chat A báo gói 3 xong (merge `feat/mf1-core`). |
| C    | 9, 10, 11     | `src/modules/licensing/**`, `src/modules/catalog/**` (trừ phần định giá của chat A), `src/modules/budgets/invoice` | Gói 9 làm phần cấp (bỏ cổng phòng, `subscriptionId` tùy chọn, `K1` +1, mua khi hết kho, `stock`) trước; phần _giải phóng cam kết khi thu hồi_, gói 10, gói 11 làm sau khi `git merge feat/mf1-core` có gói 2 + 3 (xem HANDOFF-A.md).              |
