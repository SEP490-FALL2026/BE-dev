# Review toàn nhánh

Skill: `executing-plans`, `requesting-code-review` + `code-reviewer.md`. Reviewer ngữ cảnh mới, chỉ đọc; base `595cdc48`, head `0457a395` cộng bốn file P5 chưa commit tại thời điểm review. Không chạy test/DB, không sửa worktree, không subagent phụ.

| Mức       | Phát hiện                                                                                                  | Xử lý trong một fix pass                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Important | Set/sort UUID phân biệt hoa thường, PostgreSQL coi cùng danh tính; có thể sai DUPLICATE và đảo thứ tự khóa | Canonical lowercase trong policy và catalog attach; 3 unit mới đã RED (3 fail/14 pass), GREEN ghi tại PROGRESS |
| Important | Integration barrier dùng IT1 đọc trạng thái task thuộc IT2                                                 | Helper nhận account, task thứ hai đọc bằng IT2                                                                 |
| Important | Ca đổi IT chưa phân biệt được orphan read scope với acting write scope                                     | Thêm phòng không có IT/substitute: generic task GET 200, cả hai route file 404 `PROVISIONING_TASK.NOT_FOUND`   |

Không có Critical, Minor hoặc Declined to judge. Không review lần hai; fix được xác minh bằng unit và CI theo PLAN.

Reviewer đã đối chiếu cùng transaction của file/audit/task, mayOpen ẩn READY, requireActingItAdmin ở route riêng, WebP purpose/signature, empty IDs dừng trước catalog và guard migration giữ nguyên. Verdict tại thời điểm review: cần sửa ba Important và chờ CI. Fix đã commit `aa0ad0f6`: unit catalog + licensing 2194 pass/0 fail, gates 346 pass/0 fail; integration/HTTP theo run CI trong PROGRESS. Đây không phải Owner acceptance hoặc phê duyệt merge.
