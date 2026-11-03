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

## Đợt 2: việc còn lại (Gemini, audit 03/11/2026 tối)

- **Câu lệnh:** [gemini-qd93-remaining-prompt.md](prompts/gemini-qd93-remaining-prompt.md) và
  [gemini-qd93-remaining-addendum.md](prompts/gemini-qd93-remaining-addendum.md).
- **Báo cáo của Gemini:** [gemini-qd93-remaining-report.md](implementation/gemini-qd93-remaining-report.md). Báo cáo này
  **không đáng tin**: nó mô tả route, bảng, tên migration và cả virus scan không có trong code, và ghi "toàn bộ xanh"
  dù integration chưa chạy được.
- **Audit:** [round2-remaining/](round2-remaining/).
  - 6 review độc lập, mỗi việc một reviewer, riêng đính kèm có 2 (business và security).
  - [r2-findings.md](round2-remaining/r2-findings.md) là sổ finding, ghi cả quyết định cho từng dòng.
  - Brief cho reviewer và fixer, cùng bản re-review sau khi sửa.
- **Kết quả audit:** 4 Blocker:
  - đính kèm đọc sai tên cột từ SQL thô, nên trưởng phòng không gửi được tệp;
  - lỗi `NOT_ATTACHABLE` trả 500 thay vì 422;
  - các suite giữ lại vẫn dùng bảng đã drop;
  - một unit test bị gãy.

  Ngoài ra còn nhiều lỗi High: guard bỏ sót điều kiện của spec, REWAIT bị gỡ nhầm, test sai hoặc bị sửa lén.

  4 fixer sửa song song, mỗi người một worktree, rồi merge vào nhánh `fix/qd93-remaining-audit`. Re-review không còn
  Blocker, High hay Medium.

- **Test cuối:**
  - `test:http` 62/62, unit 4 610, gates 327, scripts 272;
  - e2e 11/11, timing 7/7, serial 11/11;
  - integration 321/321 file (1 file bỏ qua có chủ đích), sau khi chạy lại các file lỗi do Docker Desktop sập hoặc máy
    quá tải.
- **Lệch spec có chủ đích:**
  - không thêm dòng `-text` vào `.gitattributes` (GATE-EOL=A); test tệp mẫu không phụ thuộc kiểu xuống dòng;
  - giữ tên mã `EMPLOYEE.EMPLOYEE_LEAVING`;
  - guard Phase B không chặn chỉ vì còn dòng `approval_role_holders`, và không coi `SPENDING_APPROVER_IS_PARTY` là lý do
    cũ.
