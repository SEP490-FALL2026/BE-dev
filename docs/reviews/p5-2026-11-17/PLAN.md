# Prompt 5 — kế hoạch tổng (chat điều phối "SEP-Start 122", 17/11/2026)

Spec chi tiết: [SPEC-5A-SBF20](SPEC-5A-SBF20.md) (chat A1) · [SPEC-5A-FIXES](SPEC-5A-FIXES.md) (chat A2) · [SPEC-5B-MESSAGES](SPEC-5B-MESSAGES.md)
(chat B) · [SPEC-5C-AI](SPEC-5C-AI.md) (chat C) · quyết định chung: [SPEC-BRIEF](SPEC-BRIEF.md) · review độc lập: [REVIEW-SPECS](REVIEW-SPECS.md).

Sửa 17/11 theo review + Owner: giữ **4 chat song song** (mục tiêu ~10 giờ đồng hồ), mã task không trùng (`S20-T*`, `FX-T*`, `N*`/`E*`, `C*`/`S*`),
dải timestamp migration cấp trước, số đếm tham số theo nhánh, giờ theo review.

## 1. Ước lượng (giờ Sonnet) và phạm vi trong prompt 5

| Chat | Spec | Trong prompt 5 | Giờ | Dời 4b / làm nếu kịp |
| ---- | ---- | -------------- | --- | -------------------- |
| **A1** — SBF-20 | SPEC-5A-SBF20 | S20-T1…T8 + T9a (catalog thôi đọc tham số cũ, review S20-6) + T9b (3 tham số `FR-8.2`, nếu `S20-Q4` = A) | **~5,5** theo review; thực tế ~7 sau khi thêm S20-3 (+0,3), S20-6 (+0,5), S20-1 (+0,5) — không nằm trên đường dài nhất | KPI-4, *tạm ngưng do NCC*, tự gia hạn qua hóa đơn, *đã đóng* ở catalog, gỡ `seat-ranking`, gói tháng cùng dòng |
| **A2** — sửa lỗi + email + collector + dọn tham số | SPEC-5A-FIXES | **Lõi ~6**: FX-T1, T2, T7, T3a, T3b (gồm Q-5A-1 = B), T8, T9a, T9b, T10 | ~6 (đủ ~10) | Sau lõi nếu kịp: FX-T6a–c, T4a, T4b, T5, T9c, T11 |
| **B** — thông báo có chữ + lỗi thu gọn | SPEC-5B-MESSAGES | Phase N (N1–N7) ngay; **Phase E sau khi A2 merge**; N3d (câu cho mã A1/A2) sau khi A1 merge | **~8,7–10** | Lệch status cùng luật, `details` các mã còn lại, 13 dòng params P2 |
| **C** — AI | SPEC-5C-AI | **Bản gọn ~5,5**: C1–C5 (merge `Bao_dev_be`, port lịch sử) + S1–S2 + exit code của S4 | ~5,5 | S3, phần còn lại S4, S5, S6 |

Tổng việc ≈ 26–28 giờ Sonnet, chạy 4 chat song song. **Đường dài nhất = B**: Phase N ~7 h ngay từ đầu; Phase E (~2,5 h) chờ A2 merge
(~6 h + merge); N3d (~0,6 h) chờ A1 merge ⟹ B xong sau **~10–11 giờ đồng hồ**, cộng **~1,5 giờ** review/merge/CI ⟹ ~11,5–12,5 giờ từ lúc mở
chat. Muốn về ~10 giờ thì dùng danh sách cắt ở §5.


> **Owner 17/11:** AI service dùng **bản WDP** (`WDP301-FA26-GR8/AI-service`, Qwen3.5-4B Q4_K_M trên Modal) cho **cả hai BE**, lâu dài. Chat C **chỉ làm BE** (C1–C5); các task repo AI đồ án (S1–S6) **bỏ khỏi prompt 5**.


> **Review 2 (17/11, REVIEW-SPECS-2.md):** giờ cập nhật — A2 lõi ~6,1 / đủ ~10,2; B ~9,3–10,5 (Phase N ~7,6); C (chỉ BE) ~6,75. Đường dài nhất vẫn B (+~0,6 h). Chờ Owner: **A2-12** chặn `ghostSeatOptimizationSummaryGet`, `ghostSeatRuleSkipList` theo phòng? (khuyến nghị: không, để 4b). Mỗi task Sonnet phải chạy `pnpm test:gates`, `pnpm arch:check` và integration file chạm (bẫy CHECK DB, response strict, gate module-graph/capability-graph/R10).

## 2. Chat, nhánh, worktree, migration

| Chat (Sonnet, Owner mở) | Nhánh từ `dev` | Worktree | Dải migration (cấp trước) | Bắt đầu |
| ----------------------- | -------------- | -------- | ------------------------- | ------- |
| A1 SBF-20 | `feat/p5-a1-sbf20` | `Code/be-p5-a1` | `20261117110000`–`20261117110900` (`…110000` values, `…110100` rules, `…110200` đóng `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`) | ngay |
| A2 sửa lỗi + collector | `feat/p5-a2-fixes` | `Code/be-p5-a2` | `20261117100000`–`20261117100900` (`…100000_drop_zbb_parameters`) | ngay |
| B thông báo + lỗi | `feat/p5-b-messages` | `Code/be-p5-b` | `20261117130000`+ nếu cần (dự kiến không) | ngay (Phase N); Phase E khi điều phối báo A2 đã merge; N3d khi A1 đã merge |
| C AI | `feat/p5-c-ai` + repo `AI-module-SEP` nhánh `feat/p5-ai` | `Code/be-p5-c` | `20261117120000_ai_provider_mode` (đổi tên từ `20261109100000`) | ngay |

Mỗi chat: một commit một task, bộ kiểm nhanh (typecheck, lint, unit + integration file chạm + thư mục module), cuối nhánh `test:http`
toàn bộ; báo cáo cuối có mục **"Thông báo mới cho 5b"** (chỉ lệch so với bảng bàn giao sẵn trong spec: SBF20 §13, FIXES §1.B), **"Breaking FE"**
(SBF20 §5, FIXES §9, 5B Phần C) và **số đếm tham số trên nhánh**.

**Số đếm tham số vận hành — không ghi cứng số cuối.** Mỗi chat thêm/bớt định nghĩa trong `PARAMETER_DEFINITIONS` thì cập nhật số đếm theo
nhánh của mình ở 3 chỗ: `parameter-definitions.policy.spec.ts` (tiêu đề "pins the … keys" + danh sách), `operating-parameters-http.integration-spec.ts:428`
(`parameters.size`), `test/support/api-collection-registry-exceptions.ts:81` (`maxItems`, hiện 22 — sai sẵn, đặt bằng số khóa thực). Thay đổi dự
kiến so `dev` (29 khóa): A2 −2, A1 −1 (+3 nếu `S20-Q4` = A), C +1. **Chat điều phối sửa lần cuối** sau mỗi lần merge vào `feat/p5`.

## 3. Thứ tự merge (chat điều phối làm, nhánh tích hợp `feat/p5` từ `dev`)

1. **A2** — ngay khi lõi xong (~6 h): mapper lỗi, global filter 503, thông báo MF-1, collector, tham số ZBB. Báo B bắt đầu Phase E.
   Phần sau lõi của A2 (FX-T6/T4/T5/T9c/T11) merge thêm một lượt nếu kịp trước B.
2. **A1** — SBF-20. Gộp tay hai file `notifications.types.ts`/`inbox.policy.ts` (chỉ thêm dòng) và `parameter-definitions.policy.ts`; tính lại số
   đếm. Báo B làm N3d.
3. **C** — migration `20261117120000` lớn hơn mọi migration của A1/A2; tính lại số đếm; `openapi:export`.
4. **B** cuối: rebase lên `feat/p5`, N3d (typecheck chặn thiếu mẫu câu), `openapi:export` một lần.
5. CI GitHub đầy đủ trên `feat/p5` + `test:flows` + `seed:local` DB trống ⟹ verify (Opus) ⟹ Owner PR `feat/p5` → `dev`.

Nếu thứ tự đổi (ví dụ C xong trước A1): bên merge sau mà tên migration nhỏ hơn migration đã có trên `feat/p5` thì đổi tên trong dải của mình
cho lớn hơn, hoặc điều phối cấp số mới, trước khi merge (`DB-15`). Sau mỗi lần merge chạy đủ job `ci.yml`.

Điểm xung đột đã biết: `notifications.types.ts`, `inbox.policy.ts` (A1, A2 thêm/đổi mã; B thêm `recipientRole` + mẫu câu); `spend.http-errors.ts`,
`account.http-errors.ts`, `out-of-process-case-closure.service.ts` (A2 rồi B Phase E — tuần tự nên không va); `http-exception.filter.ts` (chỉ A2);
`parameter-definitions.policy.ts` + 3 chỗ đếm + migration (A1, A2, C); `licensing.module.ts` (A1, A2); `openapi.json` (mọi nhánh — luôn xuất lại
sau merge, không sửa tay).

## 4. Câu hỏi Owner — **ĐÃ CHỐT 17/11: Owner chọn theo khuyến nghị** (S20-Q4 = A tham số 7/30/7; Q-5A-1 = B một thông báo mỗi lô; 5A-SBF20-Q1/Q2/Q3, Q-5A-2, P5B-Q2, 5C-Q1/Q2/Q3 = A)

**Chờ Owner** (spec đã viết theo khuyến nghị; nếu Owner chọn khác thì làm theo đoạn "Nếu B/A thì …" trong spec):

| Mã | Câu hỏi | Khuyến nghị (spec viết theo) | Phương án kia |
| -- | ------- | ---------------------------- | ------------- |
| **S20-Q4** (review S20-1) | Điểm điều chỉnh 7/30 và cảnh báo đỏ 7: hằng số hay tham số? | **A — tham số `FR-8.2` mặc định 7/30/7** (`SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY`, `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL`, `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL`), theo BRD `FR-8.2`/`FR-1.4`/`QĐ-103n`; +0,5 h | B — hằng số, ghi lệch luật, 4b làm tham số (bỏ S20-T9b) |
| **Q-5A-1** (review FX-5) | Báo Người duyệt chi khi lô tới | **B — một thông báo mỗi lô** (`SPEND_BATCH_SUBMITTED`), theo `QĐ-99h` và BRD 5.5.4; +0,4 h | A — mỗi Request một `STEP_ASSIGNED` (lô 20 mục ⟹ 20 thông báo) |

Đã có khuyến nghị A, chưa có phản hồi khác (spec làm theo A):

| Mã | Câu hỏi | A (khuyến nghị) | B |
| -- | ------- | --------------- | - |
| 5A-SBF20-Q1 | Gói tháng đổi số seat | Nối dòng kỳ mới khi IT đổi số; "cùng dòng" để 4b | Cập nhật cùng dòng ngay (đụng bất biến INV-01) |
| 5A-SBF20-Q2 | Đóng thuê bao ghi gì | Hai ô xác nhận lưu audit, chỉ khi quyền + Request mở về 0; trạng thái *đã đóng* ở catalog để 4b | Thêm trạng thái *đã đóng* ngay |
| 5A-SBF20-Q3 | Ghi điều chỉnh | Một lời gọi (đề xuất + quyết + kết quả) | Hai lời gọi (để lại ca treo) |
| Q-5A-2 | Định danh usage chưa gắn người | Mọi IT Admin thấy (như dòng import không gắn người) | Chỉ ứng viên trong phạm vi phòng |
| P5B-Q2 | Tên trong câu thông báo | Hiện tên cho người nhận, tra qua extension point; không tra được thì cụm chung | Không hiện tên (bớt 1 giờ) |
| 5C-Q1 | Ngày xóa lịch sử AI | Ngày làm việc sau buổi bảo vệ cuối | Ngày khác |
| 5C-Q2 | Đường chạy Azure CPU của repo AI | Giữ làm tùy chọn, không mặc định, chặn khởi động khi thiếu model id | Gỡ hẳn |
| 5C-Q3 | Port lịch sử AI khi đọc | Trả `record \| null`, WDP tự map lỗi | Trả trạng thái riêng |

Đã chốt: P5B-Q1 phạm vi lỗi (Owner 17/11, thông lệ Stripe/GitHub/AIP-193/RFC 9457; không đổi status/mã); B là một chat (Phase N → Phase E).

## 5. Danh sách cắt nếu trễ (theo thứ tự, ít hại nhất trước)

1. **B** — `target` của N4 ⟹ `target: null` (−0,4 h, đường dài nhất).
2. **B** — lô (iii) của E8a/E8b (−0,4 h).
3. **B** — N5 tra tên ⟹ cụm chung `NAME_FALLBACK` (−1,0 h; contract không đổi).
4. **A2** — mọi task sau lõi (FX-T6a–c, T4a, T4b, T5, T9c, T11) ⟹ 4b; mã thông báo của task bị cắt không thêm.
5. **A1** — S20-T9b (dùng hằng số, ghi lệch `FR-8.2`) ⟹ 4b (−0,5 h); rồi dòng *gói tháng giữ nguyên* của S20-T6 (−0,15 h), S20-T5 (−0,3 h).
6. **C** — chỉ còn C1–C4 + S1–S2 (−1 h).
7. **B** — E8b toàn bộ ⟹ 4b (−0,5 h).

Không cắt: A2 FX-T1/T2 (500/503), A1 S20-T1–T4/T7, B N1–N3d/N6/E2/E3, C C1–C4.

## 6. Ngoài prompt 5 (ghi nhận)

US-15-06 (bị chặn bởi US-12-14); repo WDP: adapter MongoDB đặt lên port mới + MongoDB trong CI/compose prod; QĐ-108g/108h (tệp đính kèm,
tự đóng phiếu SaaS), `markDuplicate` nhận `WAITING_*`, `ghostSeatQueueList` trả bằng chứng đầy đủ cho trưởng phòng (SoD-2) ⟹ đầu vào 4a.
