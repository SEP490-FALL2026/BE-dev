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

## Review sau B1

- Harness mở chu kỳ ngân sách khi vừa tạo hoặc khi GET trả `DRAFT`, và chờ HTTP 201 ở route mở. Commit riêng `f07dde02`.
- Ca policy nhóm theo QĐ-116b xác nhận trưởng phòng rút được dòng đã duyệt nhu cầu đang chờ trình, với lý do bắt buộc. Ca
  tích hợp xác nhận Request đã trả về người xin vẫn ở trạng thái chi `RETURNED_TO_REQUESTER` sau khi từ chối thao tác rút
  của trưởng phòng.
- Quick check bằng Node 22 đạt `pnpm typecheck`, ESLint và Prettier trên các tệp sửa, `pnpm arch:check`,
  `pnpm rules:check`, `pnpm rules:format`, 346 test tĩnh và 94 unit test trong 4 spec liên quan. OpenAPI export không
  thay đổi `openapi.json`.
- CI tay tại `c4086786` đạt job quality (10.244 unit test, 346 test tĩnh), HTTP contract, integration tuần tự và smoke
  test. Hai spec integration W4 `request-single-characterization` và `head-withdraw-submission-queue` đều đạt.
  [CI tay sau review B1](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46125525574)
- Ba shard integration song song đỏ lần lượt 256, 180 và 201 test. Đối chiếu đường dẫn suite và tên đầy đủ từng test với
  run nền cho thấy 637 ca đỏ đều trùng nền, với 0 ca đỏ mới. Suite `device-return-task.integration-spec.ts` đạt ở lượt
  này, gồm ca nhắc trả thiết bị quá hạn từng ngày làm việc từng đỏ ở nền.
  [Run nền](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46043853099)

### D-2 cần Owner chốt kết quả chi theo mục phiếu

- `AccessRequestNotFoundError` dùng `NOT_IN_TICKET` cho phiếu, kể cả khi mục có trong phiếu nhưng người gọi không xem
  được (§7.6). `NO_SPEND_STEP` từ `SpendDecisionRefusedError` tiếp tục phát tín hiệu nội bộ `NO_OPEN_STEP`. Đề xuất C-SPEND
  dò quyết định gần nhất của người gọi để trả `ALREADY_DECIDED` khi gửi lại cùng quyết định, còn lại trả `NO_SPEND_STEP`
  đúng danh sách §8.3 #4.
- Với `STEP_NOT_PENDING`, đề xuất dò quyết định đã ghi như trên, sau đó dùng `NOT_CHECKABLE` khi bước tồn tại nhưng hiện
  không thể quyết. Policy giữ kết cục nội bộ `STEP_NOT_PENDING` để Owner chốt cách ánh xạ.
- Đề xuất C-SPEND chặn mục hai bước trước khi quyết bằng `USE_BATCH` theo §7.6. Nếu luồng một bước vẫn phát sinh
  `BOUNCED_TO_HEAD` hoặc `GROUP_USES_LINES`, đề xuất coi đó là vi phạm điều kiện đầu vào của luồng và xử lý ở service.
  Cả hai kết cục hiện chỉ có trong policy nội bộ.
