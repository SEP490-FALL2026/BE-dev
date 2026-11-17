# P5-FIX-SMOKE — sửa lỗi lượt smoke cuối (điều phối 123 giao, 17/11)

Chat code Sonnet (đề xuất: chat B "SEP-Start 87", vì sở hữu thông báo và lỗi). Trả lời tiếng Việt.
**Subagent code: model sonnet.**

## Đọc trước
- Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`.
- `AGENTS.md` của BE.
- `docs/reviews/p5-2026-11-17/run/SMOKE-MUTATION.md`: bằng chứng và request/response của từng lỗi.

## Nơi làm
- Repo `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `feat/p5`.
- Owner đã push nhánh này nhưng **chưa** merge. Commit trực tiếp lên `feat/p5`, mỗi mục một commit, tên Chill, không dòng đồng tác giả AI.
- Push `feat/p5`, rồi chạy `gh workflow run ci.yml --ref feat/p5` tới khi xanh mọi job.
- Không merge `dev`/`main`, không deploy.
- Local chỉ chạy kiểm nhanh: typecheck, lint, gates, `arch:check`, test các file chạm. DB test riêng: `make-test-db.sh` cổng 35443.

## Việc
| # | Mức | Việc |
| - | --- | ---- |
| F1 | Medium | Mỗi người nhận phải mở được `target` của thông báo. Hiện trưởng phòng mở 6/10 `target` bị 403: `budgetCycleGet`, `budgetVersionGet`, `departmentTransferGet`, `offboardingCaseGet`. Sửa ở `src/modules/notifications/inbox/notification-target.policy.ts` + `InboxViewService`, xem chi tiết dưới bảng. |
| F2 | Low | `budgetAdjustmentCreate`: `MONEY_OUT_OF_RANGE` và `MONEY_SCALE_EXCEEDED` đang trả `details.path` `amount`, trong khi `VALIDATION_ERROR` cùng field trả `amount.amount`. Thống nhất theo body thật. Đối chiếu tài liệu FE `catalog/errors.md`; nếu đổi path thì ghi D-n để điều phối sửa tài liệu. |
| F3 | Nit | Sửa câu tiếng Anh "for for a subscription", "a under-used", dấu chấm đôi sau `reason` trong các file `notification-texts-*.types.ts`. Test bảng câu phải còn xanh. |
| F4 | Nit | Message của `NOT_RENEWABLE` liệt kê thiếu `CANCELLED`. |
| F5 | Nit | Thuê bao K1 vẫn trả `alerts.dates` dù route điều chỉnh trả `NOT_POOL_TERM`. Hoặc bỏ `alerts.dates` cho thuê bao không có điểm điều chỉnh, hoặc ghi D-n nếu có lý do giữ. |
| T1 | Test | Thêm test gọi trình **cùng một lô hai lần** (hoặc ghi lại sự kiện) rồi kiểm chỉ có **1** thông báo `SPEND_BATCH_SUBMITTED`. Hiện mutation bỏ eventKey chỉ bị test integration bắt nhờ so khớp nguyên chuỗi. |

**F1 — cách sửa:**
- Chọn `target` theo vai của người đang xem, dùng role trong principal mà `InboxViewService` đã biết.
- Mỗi mã khai `target` theo vai. Vai nào không đọc được route chi tiết thì dùng route danh sách mà vai đó đọc được, hoặc `null`.
- Viết lại test `notification-target.recipients.policy.spec.ts` để kiểm mọi mã: với mọi vai nhận thông báo, vai đó phải nằm trong vai mà route đích cho phép.
- Không đổi contract: vẫn chỉ một field `target`.

## Xong
1. Ghi mục "FIX smoke" vào `docs/reviews/p5-2026-11-17/run/B-DONE.md`.
2. Báo điều phối 123 `P5-FIX-SMOKE XONG`, kèm commit và link CI.
3. Điều phối sẽ verify, đưa sang WDP bằng patch và cập nhật tài liệu FE.
