# Báo cáo sáng 17/11 — đêm prompt 5 + WDP (chat điều phối 123)

Cập nhật lúc 07:45. Prompt 5 **chưa xong**: khoảng 05:30–07:40 mọi chat (cả điều phối) dừng vì hết hạn mức token. Bản dùng được ngay
cho WDP là **WDP-1** (bản dự phòng).

## 1. Tình trạng (cập nhật 16:35)

| Luồng | Nhánh @ commit | CI GitHub | Audit | Còn lại |
| ----- | -------------- | --------- | ----- | ------- |
| **WDP-1** (MongoDB lịch sử AI) | WDP `feat/wdp-ai-history` @ `1e760cbc` | xanh | **ĐẠT** | sẵn sàng merge `dev` → `main` (bản dự phòng) |
| **A2** | đã merge vào `feat/p5` | xanh | **ĐẠT** (3 lượt) | — |
| **A1** (SBF-20) | đã merge vào `feat/p5` @ `5aeab3dd` (nhánh `bc6d8da6`) | xanh | **ĐẠT** sau 2 đợt FIX (10 + 3 Required) | — |
| **C** (AI phía BE) | đã merge vào `feat/p5` @ `6bb2f3a2` | xanh | **ĐẠT** | — |
| **B** (thông báo có chữ + lỗi) | đã merge vào `feat/p5` @ `d3757876` (nhánh `05e1e434`) | xanh (run 44051996589) | Phase N, E, N3d **ĐẠT** sau FIX | — |

`feat/p5` @ `6bb2f3a2` (A2 + A1 + C):
- **CI đầy đủ:** xanh (run 44043694338).
- **Seed trên DB trống:** exit 0, ĐÃ GHI 64, ĐÃ CÓ 1. DEMO-14 vẫn cần `--continue` sau ngày khóa kỳ.
- **`test:flows`:** 11 suite pass, 1 skip; 70 test pass, 9 skip, 0 fail.
- **Số tham số vận hành:** 30.

**Prompt 5 ở SEP: code xong, `feat/p5` @ `d3757876` = A2 + A1 + C + B, CI đầy đủ xanh.** Bản cuối `d3757876`: seed DB trống exit 0, flows 70 pass / 9 skip / 0 fail. Chat 84 đang đưa sang WDP (`WDP-2-PROMPT.md`, nhánh `feat/wdp-p5`). **Tài liệu API FE xong** (Docs `main`, 7 commit `bbb13d6`…`5589dba`, chưa push): `--check` OK 426 operation, review đối chiếu code đã sửa 15 lỗi (`AUDIT-API-DOCS-review.md`); changelog FE `Figma UI-UX/API-Integration/changes/2026-11-17-prompt5.md`.

## 2. Việc Owner sáng nay

### 2.1 Deploy WDP bằng WDP-1 (nếu cần bản ngay cho hội đồng)
1. **Trên VPS, trước khi merge `main`:**
   - `.env`: thêm `MONGODB_ROOT_USER=<user>`, `MONGODB_ROOT_PASSWORD=<mật khẩu mạnh>`.
   - `.env.app`: thêm `MONGODB_URI=mongodb://<user>:<mật khẩu>@mongodb:27017/?authSource=admin` (cùng user và mật khẩu).
   - Thiếu một trong ba biến thì script deploy **dừng trước migrate**, chưa đổi gì.
   - Kiểm đĩa; `pg_dump` tay nếu muốn thêm một bản. Script tự sao lưu Postgres trước khi migrate.
   - Runbook: `docs/operations/wdp-mongodb-deploy.md` trong nhánh WDP.
2. **AI service:**
   - `.env.app` có `AI_SERVICE_BASE_URL`, `AI_SERVICE_TOKEN`, `AI_SERVICE_TIMEOUT_MS=120000`.
   - Modal theo các lệnh đã đưa: `modal secret create …`, `modal run modal_app.py::download_model …`, `AI_DEMO_WARM=1 modal deploy modal_app.py`.
     Bản Modal luôn chạy runner model (không stub).
3. **Merge trên GitHub WDP:** PR `feat/wdp-ai-history` → `dev`, rồi `dev` → `main`. Push `main` sẽ tự deploy.
4. **Sau deploy:**
   - Super Admin bật `AI_ENABLED`, `AI_ACCESS_REQUEST_SUMMARY_ENABLED`.
   - `AI_PROVIDER_MODE` **chỉ có sau prompt 5** (nhánh C), nên bản WDP-1 chưa có.
5. **Seed lại** nếu cần dữ liệu demo sạch; ngày demo chạy `seed.sh --continue` cho DEMO-14.
6. **Nếu deploy lỗi sau migrate:** recovery sẽ **REFUSED** (không quay về image cũ, vì bảng `ai_invocation_contents` đã bị xóa).
   Khi đó deploy lại bản đã sửa bằng `--attempt` mới (runbook).

### 2.2 Tool collector
- Repo `Tool-wdp` có commit local `5fe91b7` (chưa push): sửa bước 7 kịch bản demo `be-integration/plan.md` — route
  `…/completion` và id ở `data.stopRequest.id`, khớp BE mới.
- Owner quyết có push không.

## 3. Điểm tự chốt cần Owner duyệt (D-n)

- **WDP-1** (`WDP-1-DONE.md` D-1…D-9). Đáng xem:
  - D-1: app dùng root user của MongoDB; user tách quyền để sau hội đồng.
  - D-8: chưa tự `mongodump`, chỉ có lệnh tay.
- **C** (`C-DONE.md` D-1…D-6):
  - D-1: `QueueSummaryService` đổi thứ tự constructor để qua lint.
  - D-5: BE từ chối câu của runner stub (lần gọi FAILED `AI.PROVIDER_UNAVAILABLE`).
- **B** (`B-DONE.md` D-N1…D-N13). Đáng xem:
  - D-N4: `returnRequestId` chưa tra tên.
  - D-N9: câu `STEP_SLA_REMINDER` cho người yêu cầu do B tự viết ⟹ **catalog Docs cần thêm câu này**.
  - D-N7: cách đặt tên Request/Cost Center trong câu.
- **B — bổ sung lúc 09:00** (sửa Phase N xong @ `5993bf39`, CI xanh run 43992871487; R-3 đã làm ở `e6199805`):
  - O-1: cụm chung khi không tra được tên là "(không rõ tên)" / "(unnamed)".
  - E2 D-1: query phẳng `netAmount` của tax-profile trả `path = 'netAmount.amount'`, một field không tồn tại; giữ theo spec B2.
  - E3 D-5: `LICENSE_ASSIGNMENT.OVERLAP` chưa có `conflictingAssignmentId` (để 4b).
  - **`FINANCE.SETUP_INCOMPLETE` nay có `details.departmentId` ở mọi route, kể cả access-request.** Owner xem có cần giữ kín không.
- **A1** (xong @ `41c34c05`, CI xanh, đang audit; `A1-DONE.md` D-1…D-20). Owner xem:
  - **Nghi lỗi spec §4.5:** dòng KEPT không xét `autoRenew`. Gói tháng không tự gia hạn nhưng có `endDate` vẫn nhận "giữ nguyên", hôm sau lại bị đánh `EXPIRY_MARKED`. A1 làm đúng spec.
  - Cấp từ kho khi kỳ kế đã đầy trả 422, không phải 409 như brief.
  - **Seed lại VPS sau deploy prompt 5**, vì migration đóng ca `PROPOSED` cũ thành `STALE`.
- **A2** (xong toàn bộ, đã merge `feat/p5` @ `49f095a6`, CI xanh; `A2-DONE.md` có 22 D-n). Owner chọn:
  - O-06: có lọc theo phòng cho `vendorAccountDiscrepancyList` và `outOfProcessCaseList` không? Spec §C không liệt kê hai route này.
  - D-12 thành O-01, đang sửa: mapping của người đã nghỉ bị ẩn với IT.
  - Ngoài ra:  Từ audit:
  - O1: `handled_at` của yêu cầu dừng bị đóng vì đăng ký kết thúc lấy mốc kết thúc;
  - 3 lệch tên/chỗ file do `requests/spend` đủ 25 file.

## 4. Việc còn lại để xong prompt 5
1. A1 xong + audit ⟹ merge `feat/p5`.
2. B: R-3, push, Phase E, N3d ⟹ audit ⟹ merge cuối.
3. Merge C.
4. Full CI trên `feat/p5` + `test:flows` + seed DB trống.
5. Đưa sang WDP bằng patch (`git diff 94a8ee84..feat/p5` + `git apply --3way` lên `feat/wdp-ai-history`), gắn adapter MongoDB vào port `AiInvocationHistoryStore`.
6. Sinh lại tài liệu API (Docs) và changelog FE.

Ước tính: A1 và B mỗi bên còn ~2–4 giờ Sonnet, cộng ~1,5 giờ audit/merge/CI và ~1–2 giờ đưa sang WDP. Vì vậy prompt 5 **không kịp** cho buổi sáng;
WDP-1 là bản deploy hôm nay.
