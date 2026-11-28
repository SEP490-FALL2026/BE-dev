# Tiến độ đợt 4 làn B

Skill-first. Dùng executing-plans, test-driven-development, be-quick-check và verification-before-completion để triển khai và kiểm từng gói.

Nền là commit `86562437` của `feat/redesign-w4`. Worktree `D:/Đồ án/w4-lane-b` tách riêng. Cổng 0 xác nhận đợt 3 có trên `origin/dev`, migration cuối là `20261204000700` và grep khóa E5 rỗng.

| Gói        | Commit                             | Trạng thái   | Bằng chứng                      |
| ---------- | ---------------------------------- | ------------ | ------------------------------- |
| A-T1       | `46d88aa1`, `a7760410`, `d7dff37f` | B0 và B1 đạt | [A-T1](pkg/A-T1.md)             |
| A-POL2     | `51a3b96d`                         | B0 và B1 đạt | [A-POL2](pkg/A-POL2.md)         |
| B-SUBMIT-R | `be012662`                         | B1 đạt       | [B-SUBMIT-R](pkg/B-SUBMIT-R.md) |
| B-NEED-R   | `3f82146b`                         | B1 đạt       | [B-NEED-R](pkg/B-NEED-R.md)     |
| B-SPEND-R  | `54f4ea41`                         | B1 đạt       | [B-SPEND-R](pkg/B-SPEND-R.md)   |

## Kiểm tra local

- `pnpm install --frozen-lockfile --prefer-offline` và `pnpm prisma:generate` thành công.
- 7 spec unit chọn lọc có 102 test đạt. `pnpm test:gates --runInBand` có 346 test đạt.
- `pnpm typecheck`, `pnpm arch:check`, `pnpm rules:check` và Prettier đạt.
- ESLint toàn repo đạt khi chạy bằng Node 22 với `--max-old-space-size=8192`. Lượt chạy với heap mặc định hết bộ nhớ.
- OpenAPI export dùng Node 22 theo CI. `git diff --exit-code -- openapi.json` trả 0. Node 24.0.2 gặp lỗi phân giải `catalog.api` khi chạy export trên Windows.
- Sau ba refactor, 119 unit test trong 11 spec chọn lọc đạt. Typecheck, ESLint cho tệp thay đổi, kiểm tra kiến trúc, sơ đồ sinh lại, kiểm tra tài liệu và OpenAPI đều đạt.

## Cổng và bàn giao

- CI nền chạy tay trên `dev` có đúng commit `86562437`. Ba shard integration có lần lượt 256, 181 và 201 test đỏ. Cần kết quả B0 để đối chiếu từng test. [Run nền](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46043853099)
- Người giao việc đã cho phép push nhánh `feat/redesign-w4-lane-b` để chạy B0 trước khi refactor. Commit harness được push trước, sau đó mới push hai gói A.
- B0 lần đầu có 906 suite unit đạt. Hai spec integration W4 dừng khi dựng nhân viên vì mã dài hai ký tự. Job quality yêu cầu sinh lại sơ đồ module cho cạnh `requests` → `budgets`. [Run B0 lần đầu](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46092053644)
- Đối chiếu tên suite và tên test cho B0 lần đầu cho thấy 637 lỗi trùng run nền. 10 lỗi mới thuộc hai spec W4 và cùng xuất phát từ bước dựng mã nhân viên.
- Commit `a66c616f` sửa mã fixture và sinh lại sơ đồ bằng `pnpm arch:graph`. `pnpm arch:docs:check` đạt. [Run B0 sau sửa](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46109335421)
- B0 lần hai qua quality và spec rút khỏi hàng đợi. Spec đặc tả đỏ ở ba ca. Đã sửa dữ liệu K1 tháng, dùng một database cho toàn suite và ghi nhận hợp đồng HTTP thực tế của guard nhân viên chưa xếp phòng trong D-1.
- Commit `47bdf937` xác nhận ba bản sửa trên. Commit `d7dff37f` dùng builder phòng ban phù hợp ngày nghiệp vụ cố định cho ca không có Cost Center. [CI của `47bdf937`](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46111328257) · [CI của `d7dff37f`](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46111552455)
- B0 đạt tại `d7dff37f`. Hai spec integration mới và job quality đều đạt. Đối chiếu tên suite và từng test cho thấy toàn bộ 637 lỗi integration còn lại đã có trong 638 lỗi trên run nền. [B0](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46111552455)
- B1 đạt tại `54f4ea41`. Hai spec integration W4 đạt. Job quality đạt 10.221 unit test và 346 test kiểm tra tĩnh. HTTP contract, integration tuần tự và smoke test cũng đạt. Toàn bộ 637 lỗi integration song song trùng tên suite và tên test với run nền. [B1](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46114002889)
- Full test chỉ chạy trên CI GitHub.
