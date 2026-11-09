# Prompt cập nhật tài liệu API cho FE sau Đợt 1 (06/11/2026)

Dán nguyên khối dưới vào một chat Claude Code mới, mở tại `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration`. Chỉ chạy **sau khi**
Owner đã commit + push + CI/CD deploy bản Đợt 1 và báo sha đã deploy.

```text
Trả lời tiếng Việt; tên file/route/field/mã lỗi giữ nguyên tiếng Anh.

Việc: cập nhật tài liệu API cho FE (thư mục hiện tại `Figma UI-UX/API-Integration`) theo bản BE Đợt 1 đã deploy, sha: <ĐIỀN SHA>,
nhánh: <ĐIỀN NHÁNH>. Đọc trước, theo đúng thứ tự:
1. changes/maintenance.md — quy trình bắt buộc (generator, checkout sạch, --compare, phần sinh vs phần viết tay). Làm đúng theo đó.
2. Bảng thay đổi contract Đợt 1 trong repo BE (đường dẫn tương đối từ BE):
   docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/FIELD-CHANGES-DOT-1.md (field bỏ ⟹ 422, field bắt buộc mới, route gỡ ⟹ 404, output bỏ)
   docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-1.md §1 (sau Đợt 1 mỗi flow làm được gì / còn để đợt sau)
   docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/FIX-DOT-1.md (các sửa sau review: mã lỗi mới, hành vi đổi)
   docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-2-4.md §1 (những gì SẼ đổi ở đợt sau)
   src/cli/seed/fixture/shared-demo-v3/README.md và docs/workspace/items/qd96-100-seed-demo-v3/spec.md (tài khoản đăng nhập mới @saoviet.example)
   docs/workspace/items/g7-*/spec.md (API nối tool AI collector), qd96-100-manager-employee-detail/spec.md, qd96-100-subscription-owner-confirmation/spec.md

Bước làm:
A. `git clone -b <nhánh> <BE> <thư mục scratch>`, kiểm `git -C <scratch> rev-parse HEAD` = sha đã deploy. Chạy
   `node tools/build-api-docs.mjs --be <scratch> --compare coverage-manifest.json --old-openapi <openapi.json của db9e098f>` (lấy bằng
   `git -C <scratch> show db9e098f63f0e3b3f9bcadc7436b39c70893500d:openapi.json`), lưu kết quả so sánh.
B. Bổ sung chú thích (tools/annotations, tools/glossary) cho MỌI operation/field/enum mới để `--check` không báo thiếu: G7 (25 op:
   devices, monitoring notices, enrollment, device-session, usage, tool-status, intake-rejections), chi tiết nhân viên cho trưởng phòng
   (3 op), subscription-renewal (body confirm mới, STALE, PROPOSER_IS_OWNER_HEAD), personnel (accessBlockMode, grounds, accessBlocked…),
   budgets (reserveReason, money {amount}), requests (extensionMonths, termLimit, TOO_FEW_LINES…), appUserUnlock (ACCESS_BLOCK_NOT_RELEASABLE).
   Rồi sinh lại: `node tools/build-api-docs.mjs --be <scratch>` và `--check` phải exit 0.
C. Sửa phần viết tay:
   - README: bảng revision (sha mới, ngày, đã deploy), tóm tắt Đợt 1.
   - changes/CHANGELOG.md + file mới changes/2026-11-06-<sha8>-openapi.md: liệt kê theo flow 3 phần —
     (1) **Contract đã chốt** (FE nối ngay): field bỏ/đổi/bắt buộc mới, route gỡ, API mới, mã lỗi mới, scheme `deviceCredential`, actor `DEVICE`;
     (2) **Logic cũ vẫn chạy** (FE hiển thị theo hành vi hiện tại): kiểm ngân sách giữ mã cũ (OVERRIDE_REQUIRED khi thiếu, chưa trừ Request
     đang chờ), nhánh Finance rà soát còn, chưa có xác nhận dự phòng, chưa có cửa sổ 30 ngày cho Request tiếp tục, điều chuyển quá hạn chỉ nhắc,
     hủy nghỉ việc chưa rút tác vụ thu hồi đã mở;
     (3) **Sẽ đổi ở đợt sau** (FE dựng linh hoạt): kết quả ngân sách WITHIN_BASE/NEEDS_RESERVE/BLOCKED, xác nhận dự phòng, ngày kết thúc BE
     tính lúc duyệt chi, gỡ Finance rà soát, Request thay thế khi điều chuyển, G1–G4/usage vendor/extension.
   - flows/: paid-access-request, new-software-request, internal-free-request, annual-budget, offboarding, department-transfer,
     manager-api-handoff, account-roles — sửa theo contract mới; thêm flows/ai-collector-device.md (đăng ký máy → BM-06 → nhân viên xác nhận →
     mã đăng ký → tool be-enroll/be-session/be-upload → IT/nhân viên đọc usage; chỉ số đếm, không nội dung chat) và flows/subscription-rightsizing.md
     (IT đề xuất kèm releasedAssignmentIds → trưởng phòng sở hữu CONFIRM → ghi kết quả; STALE ⟹ đề xuất lại).
   - roles/: quyền mới (trưởng phòng xem chi tiết nhân viên phòng mình, trưởng phòng sở hữu xác nhận điều chỉnh thuê bao, Finance chỉ đọc
     renewal, IT không còn tự cấp cho chính mình).
   - demo/accounts.md + demo/scenarios.md: tài khoản @saoviet.example (22 tài khoản, mật khẩu do Owner cấp riêng — KHÔNG ghi mật khẩu),
     kịch bản demo gợi ý: dùng phòng ENG/MKT/SAL cho Request trả phí (có ngân sách 2026+2027), DES để demo Finance rà soát (R9),
     Jira Standard của ENG cho điều chỉnh thuê bao.
   - ai-integration-guide.md: cập nhật nếu nhắc field/route đã bỏ.
   Grep toàn thư mục các từ đã bỏ (expectedSpendOn, termConfirmation, planLine, offPlan, override, delegated-requests, highValue,
   windowFrom, newExpectedEndDate, NEEDS_NEW_TOOL, abrupt, slm-demo, DS1-) — chỉ được còn trong changelog/ghi chú "đã bỏ".
D. Kiểm: `--check` exit 0, `node --test "tools/test/*.test.mjs"` xanh, link nội bộ đúng.

Giới hạn: không sửa repo BE, không commit/push, không ghi mật khẩu/token. Bàn giao: danh sách file đổi, kết quả --compare (số op thêm/bỏ/đổi),
kết quả --check, và đoạn tóm tắt ngắn (≤ 15 dòng) để Owner gửi FE.
```
