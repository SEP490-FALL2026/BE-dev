# Phân loại CI P5

**Cập nhật sau snapshot bên dưới:** user đã cho phép ngoại lệ D-2; run `46162602020` đã xong. Có **639 test đỏ duy nhất = 637 nợ cũ + 2 mới**. Danh sách từng test: [CI-CLASSIFICATION-46162602020.md](CI-CLASSIFICATION-46162602020.md). Hai lỗi mới là inventory POST cũ và fixture K1 của test mới; đang sửa trong vòng CI 1. Các bảng snapshot bên dưới giữ lại lịch sử trước khi user trả lời, không phải trạng thái mới nhất.

Skill: `verification-before-completion`, `systematic-debugging`.

- Nhánh: `feat/provisioning-evidence-files`, code head `aa0ad0f6629e9ce73607b0cd8257379f2d3e77ed`.
- Nền cố định: [46116992628](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46116992628), 637 test đỏ/108 suite, ba shard integration; quality/HTTP/inband xanh, smoke skipped.
- Run nhánh: [46162602020](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020).
- Snapshot **28/11/2026 23:11 UTC+7**: run còn chạy. **Chưa thể phân loại toàn bộ integration.** Không được suy ra số lỗi mới bằng 0.

## Từng test đỏ đã biết

| File                                                | Tên đầy đủ                                                                                                                                             | Phân loại                                  | Nguyên nhân / xử lý                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/http/licensing/provisioning.http-spec.ts:414` | provisioning queue routes (e2e, no database) › has no route that makes a revocation: each source opens it through the licensing facade (US-07-05 AC-3) | **MỚI**: không đỏ trên nền (HTTP nền xanh) | Danh sách POST nhận thêm `/{id}/evidence-files/{fileId}/links` đúng SPEC EV-14. Expectation cũ không chứa route. D-2 cần ngoại lệ LUẬT CỨNG 4; patch đề xuất chưa áp dụng. |

HTTP: **1 fail/2868 pass**, 124 suites: 123 pass/1 fail. Spec mới `provisioning-evidence-files.http-spec.ts` PASS. Log đã kiểm cả khối lỗi đầu và summary; cùng tên bị in hai lần chỉ tính một test.

## Từng job

| Job                | Trạng thái tại snapshot | Số test thật / link                                                                                                                                              |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quality            | success                 | unit 10266 pass/0 fail, 911 suites; gates 346 pass/0 fail, 17 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117780) |
| http-contract      | failure                 | 2868 pass/1 fail; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117812)                                                     |
| e2e-smoke          | success                 | 48 pass/0 fail, 10 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117789)                                            |
| integration-inband | success                 | timing 31 pass/0 fail, 8 suites; serial 100 pass/0 fail, 14 suites; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117778)   |
| integration (1)    | in_progress             | **Chưa có phân loại**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117816)                                                |
| integration (2)    | in_progress             | **Chưa có phân loại**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117846)                                                |
| integration (3)    | in_progress             | **Chưa có phân loại**; [job](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020/job/141033117817)                                                |

## Việc còn lại khi được cho phép tiếp tục

1. Owner quyết định D-2. Không tự sửa expectation, lọc route khỏi OpenAPI hoặc bỏ route đúng SPEC để làm xanh.
2. Lấy log ba shard của cùng run khi xong. So cặp `(file, full test title)` với run nền, không chỉ so tổng fail và không so theo shard (sharding đổi theo số file).
3. Ghi **từng** test đỏ integration và phân loại cũ/mới; sửa lỗi mới trong tối đa hai vòng được giao, kiểm nhanh + unit rồi push/dispatch CI lại.
4. Chỉ đánh dấu P5 xong khi đủ tiêu chí PLAN §7; hiện chưa đạt. Full test chỉ chạy trên CI GitHub.
