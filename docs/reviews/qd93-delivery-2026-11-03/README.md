# QĐ-93 — triển khai, audit và bản giao 03/11/2026

Hồ sơ làm việc của gói sửa BE theo `QĐ-93` (Owner 01/11/2026, quyết định `D-S1` → `D-S28`). Thư mục giữ câu lệnh đã
giao cho các phiên AI, nhật ký và báo cáo triển khai, kết quả review và audit, để lần sau tra lại. Việc còn lại nằm ở
[roadmap](../../roadmap.md#việc-còn-lại-của-gói-qđ-93-ghi-03112026). Spec, plan và test của từng hạng mục nằm trong
`docs/workspace/items/<slug>/`.

## Bản giao

- Nhánh `fix/qd93-final`. Nhánh gồm:
  - #1–#6 theo spec: bỏ `hrBasis`; bỏ chuyển giao Super Admin trong app; nhãn tham số vận hành; vai `MANAGER` và
    `SPENDING_APPROVER` cấp trực tiếp; bỏ dự án (phase 1); bỏ người duyệt dự phòng và người thay thế (phase A).
  - Bản tối giản của format mã, nhân viên chưa xếp phòng kèm xếp phòng lần đầu, và import `.xlsx` (merge `42138a99`).
  - Các sửa của audit.
  - Dữ liệu demo có thêm phòng `DS1-MKT` và `DS1-SAL`.
  - Danh bạ nhân viên cho Super Admin (Gemini, merge `0c84a9bc`, sửa audit `3e3cf282`).
- Chưa có trong bản giao:
  - Ghi nghỉ việc cho người chưa xếp phòng: tạm trả 409.
  - Tải tệp lên cho ngân sách.
  - Dashboard đếm thật.
  - Phase B / phase 2 (gỡ bảng).
- Log test thô (vài MB) không đưa vào repo. Bản trên máy Owner: `NOTE MD/qd93-logs/`.

## Thứ tự đọc

| Thư mục                            | Nội dung                                                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [prompts/](prompts/)               | Câu lệnh theo thời gian. `qd93-overnight-prompt.md` là bản điều phối ban đầu. `qd93-codex-prompt.md` giao cho Codex. `qd93-claude-continue-prompt.md` là bản Claude làm tiếp. `codex-lean-3-tasks-prompt.md` là bản tối giản của 3 việc. |
| [implementation/](implementation/) | `qd93-implementation-progress.md`: nhật ký, gồm mọi thay đổi quy trình của Owner. `qd93-implementation-report.md`: báo cáo #1–#6. `codex-lean-3-tasks-report.md`: báo cáo bản tối giản. `A-*.md`: log của từng phase.                    |
| [audit/](audit/)                   | `findings.md`: sổ finding và cách xử lý. `review-*.md`: các review độc lập (#1–#3, #4, #5, dữ liệu seed, bản tối giản). `_reviewer-brief.md`: brief chung cho reviewer.                                                                  |

## Quy trình đã áp (Owner, 02–03/11/2026)

1. Kiểm nhanh sau mỗi hạng mục thay cho `pnpm check`: typecheck, lint, arch, rules, gates, OpenAPI, cùng test theo file.
2. Mỗi phase một implementer. Bỏ bước verify riêng bằng Opus.
3. Integration và e2e được viết nhưng không chạy lúc implement. Audit chạy toàn bộ một lần.
4. Deploy lên VPS mới với database trống. Vì vậy bỏ lệnh chuyển đổi dữ liệu (`#6` Task 10) và preflight của Phase B
   (Task 12).
5. Ngày 03/11, Owner chốt giao #1–#6 cộng bản tối giản của 3 việc. Phần còn lại ghi vào roadmap.

Bài học: một danh sách lỗi có hạn giao cần bản sửa nhỏ nhất và làm trực tiếp, không cần spec dài và TDD cho từng task.
Trước khi để máy chạy qua đêm, phải tắt chế độ ngủ của máy.
