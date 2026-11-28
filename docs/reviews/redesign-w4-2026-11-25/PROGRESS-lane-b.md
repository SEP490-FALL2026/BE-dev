# Tiến độ đợt 4 làn B

Skill-first. Dùng executing-plans, test-driven-development, be-quick-check và verification-before-completion để triển khai và kiểm từng gói.

Nền là commit `86562437` của `feat/redesign-w4`. Worktree `D:/Đồ án/w4-lane-b` tách riêng. Cổng 0 xác nhận đợt 3 có trên `origin/dev`, migration cuối là `20261204000700` và grep khóa E5 rỗng.

| Gói        | Commit                             | Trạng thái                                    | Bằng chứng              |
| ---------- | ---------------------------------- | --------------------------------------------- | ----------------------- |
| A-T1       | `46d88aa1`, `a7760410`, `bbc3c293` | Harness và đặc tả ở local, integration chờ CI | [A-T1](pkg/A-T1.md)     |
| A-POL2     | `51a3b96d`                         | Policy và spec ở local, integration chờ CI    | [A-POL2](pkg/A-POL2.md) |
| B-SUBMIT-R |                                    | Chờ B0                                        |                         |
| B-NEED-R   |                                    | Chờ B0                                        |                         |
| B-SPEND-R  |                                    | Chờ B0                                        |                         |

## Kiểm tra local

- `pnpm install --frozen-lockfile --prefer-offline` và `pnpm prisma:generate` thành công.
- 7 spec unit chọn lọc có 102 test đạt. `pnpm test:gates --runInBand` có 346 test đạt.
- `pnpm typecheck`, `pnpm arch:check`, `pnpm rules:check` và Prettier đạt.
- ESLint toàn repo đạt khi chạy bằng Node 22 với `--max-old-space-size=8192`. Lượt chạy với heap mặc định hết bộ nhớ.
- OpenAPI export dùng Node 22 theo CI. `git diff --exit-code -- openapi.json` trả 0. Node 24.0.2 gặp lỗi phân giải `catalog.api` khi chạy export trên Windows.

## Cổng và bàn giao

- CI nền chạy tay trên `dev` có đúng commit `86562437`. Ba shard integration có lần lượt 256, 181 và 201 test đỏ. Cần kết quả B0 để đối chiếu từng test. [Run nền](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46043853099)
- B0 cần chạy `ci.yml` trên commit có hai gói A. Người giao việc yêu cầu push một lần khi toàn bộ công việc hoàn tất. B0 đang chờ quyết định về thời điểm push hoặc tiêu chí thay thế được duyệt.
- B1 chờ ba gói refactor và B0.
- Full test chỉ chạy trên CI GitHub.
