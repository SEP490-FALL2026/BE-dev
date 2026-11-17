# Prompt 5 — luật chung cho 4 chat code (chat điều phối "SEP-Start 123" giao, 17/11/2026)

Áp dụng cho A1 (SBF-20), A2 (sửa lỗi), B (thông báo + lỗi), C (AI-BE). Trả lời tiếng Việt; giữ tiếng Anh cho code, đường dẫn, lệnh.
Model: Sonnet, effort high. **Subagent code: model sonnet**, mỗi gói một subagent, chạy tuần tự, chỉ review nhẹ từng gói.

## 0. Đọc trước

1. Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`:
   - chọn một process skill, các skill test/debug cần dùng và verification-before-completion;
   - đọc từng `SKILL.md`;
   - liệt kê skill đã dùng ở đầu báo cáo.
2. `AGENTS.md` trong worktree của bạn và các rules BE nó dẫn tới (`docs/rules/`, `test/README.md`).
3. Thư mục spec (chưa commit, chỉ nằm ở thư mục BE chính): `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\p5-2026-11-17\`:
   - `PLAN.md`: §2 nhánh, migration, số đếm tham số; §3 merge; §5 danh sách cắt;
   - `SPEC-BRIEF.md`;
   - spec của bạn;
   - `REVIEW-SPECS.md`, `REVIEW-SPECS-2.md` (và `REVIEW-SPECS-2-SBF20.md` cho A1).

   Spec đã áp cả hai lượt review. Khi spec và review lệch nhau thì **spec thắng**.
   **Không sửa** các file trong thư mục này; lệch thì ghi `D-n`.

## 1. Luật repo

- Chỉ làm trong worktree và nhánh của mình (bảng ở prompt riêng). Nhánh tạo từ `dev` @ `94a8ee84`.
- Một commit cho một task, message tiếng Anh `feat|fix|test(<module>): …`, kèm mã task.
- Danh tính git của repo là "Chill". **Không** thêm dòng đồng tác giả AI. **Không** dùng `--no-verify`.
- Được push **nhánh của mình** lên `origin` và chạy `gh workflow run ci.yml --ref <nhánh>` (CI chạy mọi suite).
- **Cấm:**
  - push hoặc merge `dev`/`main`, deploy;
  - sửa Docs hay nhánh/worktree của chat khác;
  - đổi tên migration ngoài dải được cấp;
  - sửa tay `openapi.json` (chỉ được sinh bằng `pnpm openapi:export`).
- Khi bắt đầu:
  - `pnpm install --frozen-lockfile` và `pnpm prisma:generate` trong worktree;
  - dựng DB test riêng: đọc script trước rồi chạy `bash C:/Users/Asus/AppData/Local/Temp/claude/cb9d99d994b36370/7eb159d2-d9bb-4061-8261-d8e89677a8a4/scratchpad/make-test-db.sh <tên> <port>`
    (tên/port ở prompt riêng);
  - dùng `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:<port>/postgres`;
  - Redis dùng chung container `redis-server` (6379).
  - Docker treo thì `docker desktop restart` rồi dựng lại.
- **Mỗi task:**
  - code;
  - test đỏ trước rồi xanh cho hành vi mới;
  - tự review diff;
  - `pnpm typecheck`, `pnpm lint`, unit liên quan;
  - integration các file chạm (`--maxWorkers=1`);
  - `pnpm test:gates`, `pnpm arch:check`.
- **Cuối nhánh:**
  - tự review toàn bộ diff so với spec;
  - `pnpm check`, toàn bộ `pnpm test:http --maxWorkers=2`, integration các thư mục module đã chạm;
  - `pnpm openapi:export` rồi commit `openapi.json` nếu đổi;
  - push nhánh và chạy CI GitHub;
  - **đỏ thì sửa tới khi xanh trên commit cuối**.
- **Phân loại lỗi khi test:**
  - Test cũ đỏ vì luật mới của chính task này: sửa test trong task đó.
  - Test đỏ không liên quan, do nợ test hoặc harness: ghi một dòng vào mục "Nợ test", không sửa.
  - Nghi lỗi logic sản phẩm ngoài phạm vi: ghi "Nghi lỗi logic", không sửa.
- **Quyết định mở:** câu hỏi đổi phạm vi, hành vi hoặc quyền mà spec chưa trả lời thì ghi `D-n` (phương án, khuyến nghị, căn cứ QĐ),
  chọn phương án an toàn **không trái QĐ** rồi làm tiếp. Chỉ dừng khi bị chặn thật.
- **Đẩy nhanh (Owner 17/11 đêm):** local CHỈ bộ kiểm nhanh mỗi task (typecheck, lint, unit, integration file chạm, `test:gates`, `arch:check`); **không** chạy `test:http`/integration/`pnpm check` toàn bộ ở local — push nhánh và `gh workflow run ci.yml --ref <nhánh>` ở cuối nhánh và sau mỗi lần sửa; luật này thắng mục "Cuối nhánh" bên trên. Phần độc lập (không chạm file chung) được giao subagent Sonnet chạy song song.
- **Chế độ đêm (Owner 17/11):** điểm chưa có nguồn thì tự chốt theo luật trên và ghi `D-n` vào báo cáo để Owner duyệt sáng; không hỏi Owner, không dừng chờ.
- **Trễ:** cắt theo `PLAN.md` §5 đúng thứ tự, ghi lại phần đã cắt.

## 2. Báo cáo

Ghi vào `D:\FPT\FALL2026\Code\verify-logs\p5\<CHAT>-DONE.md`:

- skill đã dùng;
- bảng task → commit → lệnh → kết quả thật;
- link run CI và trạng thái từng job;
- `D-n`;
- **"Thông báo mới cho 5b"** — chỉ phần lệch so với bảng bàn giao sẵn trong spec;
- **"Breaking FE"**;
- **số đếm tham số trên nhánh**;
- "Nợ test", "Nghi lỗi logic", "Đã cắt/Chưa làm".

Xong (hoặc tới mốc chờ) thì `SendMessage` tới **"SEP-Start 123: reseach,review,plan - fix main flows 2-3"**. Dòng đầu tin nhắn là
`<CHAT> XONG` hoặc `<CHAT> TỚI MỐC <x>`. Sau đó DỪNG, chờ điều phối review/merge.
