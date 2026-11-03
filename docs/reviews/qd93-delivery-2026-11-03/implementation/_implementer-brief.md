# Brief chung cho subagent implement/sửa lỗi QĐ-93 (Owner, 02/11/2026)

Repo: `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (NestJS + Prisma + PostgreSQL). Làm trực tiếp trong thư mục
này (không tạo worktree). Spec/plan/test-plan: `docs/workspace/items/<slug>/{spec,plan,test-plan}.md` — spec là nguồn, làm
ĐÚNG plan theo thứ tự task. Trước khi code đọc `AGENTS.md`, `CONTRIBUTING.md`, `test/README.md` và các `docs/rules/*.md`
mà plan dẫn tới.

## Giới hạn cứng
- Commit LOCAL trên nhánh `feat/qd93-*` được giao, theo task: `<slug> task <n>: <tóm tắt>`. KHÔNG push, KHÔNG merge,
  KHÔNG deploy, KHÔNG chạy gì lên VPS/DB dùng chung, KHÔNG chạy `ops:*` lên môi trường thật. KHÔNG sửa repo
  `D:\FPT\FALL2026\Docs`. KHÔNG sửa `scripts/verify/merged-migrations.txt`. Không dùng `git stash` trần.
- KHÔNG đụng worktree `D:\FPT\FALL2026\Code\BE-qd93-audit` và nhánh `fix/qd93-final` (của chat audit): không
  `git worktree remove/prune`, không xóa/checkout nhánh đó.
- 11 spec coi là `ready`. "Hạng mục trước đã merged-dev" = "nhánh hạng mục trước đã xong, bộ kiểm nhanh xanh".
- Timestamp migration mới = thời điểm tạo thật, xếp sau migration mới nhất trên nhánh.
- KHÔNG đổi phạm vi/nghiệp vụ spec, KHÔNG tự thêm nghiệp vụ. Spec không phủ / mâu thuẫn → ghi câu hỏi, chọn giữ hành vi
  hiện có nếu an toàn, làm tiếp phần không phụ thuộc.
- Không eslint-disable/ts-ignore trái rule repo; không nới rule (vd. max-lines → tách file).

## Bổ sung của Owner
- TEST CỦA TÍNH NĂNG BỊ GỠ: ĐƯỢC PHÉP và BẮT BUỘC thay/xóa test + assertion của tính năng mà SPEC yêu cầu gỡ (route,
  trường, enum, mã lỗi, vai, luồng bị bỏ: projects/projectLabel, approval-roles, FALLBACK_APPROVER, CONFLICT_SUBSTITUTE,
  waitingReason/hint cũ, hrBasis, super-admin-transfers…). MỖI test gỡ phải có test thay chứng minh hành vi mới (404,
  trường không còn, body cũ 422…). Ghi bảng ánh xạ "test cũ (file:tên) → test mới (file:tên)" vào bảng bằng chứng của
  plan.md. VẪN CẤM xóa/skip/nới test của hành vi spec GIỮ NGUYÊN để cho xanh.
- SPEC LỆCH HÀNH VI CODE CÓ TỪ TRƯỚC (mã HTTP, tên field…): giữ hành vi code, ghi vào báo cáo, làm tiếp. Đã biết: grant role
  201; revoke 200 `ROLE.REVOKED`; PATCH phòng ban body rỗng 422 `DEPARTMENT.UPDATE_EMPTY`.

## Kiểm tra (chỉ bộ kiểm nhanh)
- THAY ĐỔI QUY TRÌNH 4 (Owner 02/11 23:00) — ƯU TIÊN hơn mọi dòng bên dưới: VẪN VIẾT đủ integration/e2e/migration test
  mà plan + bảng Primary Story/AC yêu cầu (không bỏ AC, không nới test hành vi giữ nguyên), nhưng KHÔNG CHẠY
  `pnpm test:integration`, `test:e2e`, `test:integration:timing` (kể cả theo file, kể cả lượt "đỏ"). Chỉ chạy bộ kiểm nhanh
  + unit `pnpm test -- <file>` + HTTP `pnpm test:http -- <file>`; migration mới → `pnpm prisma:validate`. Bảng bằng chứng:
  integration ghi "đã viết, CHƯA chạy — audit chạy". Báo cáo cuối liệt kê mọi file integration/e2e mới/đã sửa.
- THAY ĐỔI QUY TRÌNH 5 (Owner 03/11): deploy lên VPS MỚI, DB trống, CI/CD tạo từ đầu rồi seed — KHÔNG có dữ liệu cũ cần
  chuyển đổi. BỎ task/test chỉ nhằm xử lý dữ liệu có sẵn trước migration (backfill, test migration trên bảng đã có dòng,
  dữ liệu legacy chờ chuyển đổi, lệnh/runbook chuyển đổi). VẪN GIỮ: migration chạy sạch trên DB trống, ràng buộc/trigger
  nghiệp vụ mới, seed demo (`dev:seed`/demo dataset) khớp quy tắc mới. Không gỡ phần đã commit. Mỗi task/test bị bỏ ghi vào
  bảng bằng chứng plan "bỏ — DB mới, Owner 03/11" và liệt kê trong báo cáo cuối.
- Trong lúc làm: test đỏ trước rồi xanh, chạy test THEO ĐƯỜNG DẪN FILE cụ thể:
  `pnpm test -- <file>`, `pnpm test:http -- <file>`.
  KHÔNG dùng `-t`/pattern/thư mục (đã có sự cố: đối số sau `--` bị coi là mẫu file và kéo cả bộ integration).
- Cuối phần được giao: `pnpm typecheck` · `pnpm lint` · `pnpm arch:check` · `pnpm rules:check` · `pnpm test:gates` ·
  `pnpm openapi:export` (không drift; nếu spec đổi contract thì commit `openapi.json` + `docs/generated/*` liên quan).
  Cần `pnpm prisma:generate` khi đổi Prisma.
- KHÔNG chạy `pnpm check`, toàn bộ `test:integration`, `test:e2e`, `test:integration:timing`.
- DB test local (container `slm-test-db`, 127.0.0.1:55432) — env đặt trong tiến trình (PowerShell):
  `$env:TEST_DATABASE_ADMIN_URL='postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres'`;
  `$env:TEST_DATABASE_BOOTSTRAP_URL='postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:55432/postgres'` (chỉ `_serial`
  cần). Không export các biến này khi chạy test:scripts/gates (đã từng làm đỏ bootstrap-installation.test). Container tắt
  ⟹ `docker start slm-test-db`.
- Trên Windows dùng `pnpm.cmd` nếu `pnpm` không chạy trong PowerShell.

## Ghi chép và bàn giao
- Ghi chi tiết (lệnh + kết quả, file đã sửa, phân tích) và cập nhật DẦN trong lúc làm vào
  `D:\FPT\FALL2026\NOTE MD\qd93-logs\A-<slug>-<phase>.md` — nếu bạn bị ngắt, người sau đọc file này + `git log` để làm tiếp.
- Ghi bảng bằng chứng vào `plan.md` (chỉ kết quả thật đã chạy) và commit cùng task cuối.
- Kết thúc với working tree SẠCH (mọi thứ đã commit) trừ khi có lý do ghi rõ.
- BÁO CÁO CUỐI ≤300 từ: trạng thái (DONE / DONE_WITH_CONCERNS / PARTIAL / BLOCKED), nhánh + SHA cuối, task đã xong/chưa,
  lệnh bộ kiểm nhanh + kết quả, test theo file đã chạy (số pass), migration mới, lệch spec, câu hỏi Owner, số dòng bảng
  "test cũ → test mới" (chi tiết trong plan/log).
