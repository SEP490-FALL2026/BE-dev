# REVIEW-SPECS-2 — review lượt 2: SPEC-5A-FIXES, SPEC-5B-MESSAGES, SPEC-5C-AI (17/11/2026)

Chỉ đọc code: BE `dev` @ `94a8ee84`; nhánh AI `origin/Bao_dev_be` đọc bằng `git show`/`git diff`/`git merge-tree` dạng cũ, không ghi object.
Không chạy lệnh ghi git. **SPEC-5A-SBF20 không review lượt này.**
Luật đối chiếu: sổ QĐ (`QĐ-99h`, `QĐ-101a`, `QĐ-103b/e/m`, `QĐ-108f`, `QĐ-111ax`, `QĐ-66ae`, `QĐ-102`, `QĐ-79c`, `QĐ-78`), BRD 5.5.4 và
dòng 290 (vai Người duyệt chi), `SBF-05a`, `SBF-07a`, `SBF-08`, `SBF-09`, `docs/rules/module-structure.md`, các gate trong `test/gates/`.

Chỗ sửa trong spec đều có ghi chú "Review 2": SPEC-5A-FIXES 29 chỗ, SPEC-5B-MESSAGES 17 chỗ, SPEC-5C-AI 15 chỗ.

**Skill đã đọc/dùng:**
- `agent-skills:spec-driven-development` (process): đối chiếu spec với khung spec, kiểm điều kiện xong có kiểm được không, kiểm ranh giới.
- `agent-skills:code-review-and-quality` (review): chia mức Critical / Required / Optional / FYI; xét kiến trúc, đúng sai, bảo mật.
- `superpowers:verification-before-completion` (verification): mỗi phát hiện dưới đây đều có lệnh đọc code hoặc nguồn chạy trong lượt này.

Cách làm: tôi tự review SPEC-5A-FIXES. Hai fork review song song SPEC-5B (`B2-*`) và SPEC-5C (`C2-*`), mỗi fork chỉ sửa spec của mình.

## 1. Đã áp quyết định Owner chưa (PLAN §4)

| Quyết định | Trạng thái |
| --- | --- |
| **Q-5A-1 = B**: `SPEND_BATCH_SUBMITTED`, một thông báo mỗi lô | Đã áp và đánh dấu "ĐÃ CHỐT". Lượt này sửa thêm cách lấy người nhận và ca sót (A2-2…A2-4). Chi tiết các ca ở §4. |
| **Q-5A-2 = A**: `usageUnmatchedIdentityList` không giới hạn theo phòng | Đã áp, đánh dấu "ĐÃ CHỐT". |
| **P5B-Q2 = A**: hiện tên trong câu thông báo, tra qua extension point | Đã áp. Lượt này sửa thêm phần wiring (B2-1…B2-4). |
| **P5B-Q1**: phạm vi lỗi | Đã áp. |
| **5C-Q1/Q2/Q3 = A** | Đã áp. Lưu ý: phần thực thi Q1 (S6) và Q2 (S5) nằm ngoài bản gọn (C2-9). |

## 2. Bảng phát hiện

Cột "Xử lý": **Đã sửa** = đã sửa trong spec; **Cần Owner** = cần Owner quyết; **Ghi nhận** = không đổi spec.

### SPEC-5A-FIXES (chat A2)

| ID | Mức | Vấn đề | Xử lý |
| --- | --- | --- | --- |
| A2-1 | **Critical** | §E1 coi `setAcknowledged` dùng `COALESCE` là lỗi cần sửa, và cho bước hoàn tất chỉ đặt `collection_stopped_at`. Nhưng CHECK `device_registrations_one_projection` (`20261107000000…/migration.sql:164`) cấm hai cột `acknowledged_from` và `collection_stopped_at` cùng khác null. Làm theo spec cũ thì `deviceStopRequestComplete` vi phạm CHECK (23514) và trả 500. Vì sau khi dừng `acknowledged_from` luôn NULL, `COALESCE` tự đặt mốc mới đúng `QĐ-101a`, nên lỗi được mô tả không tồn tại. | **Đã sửa:** hoàn tất dùng một `UPDATE` đặt `collection_stopped_at = now, acknowledged_from = NULL` (`RegistryRepo.setCollectionStopped`). Không sửa `setAcknowledged`. Cập nhật FX-T9a/T9b và TS-11. |
| A2-2 | **Critical** | B2 dặn "gom `assigneeEmployeeId` của các bước vừa mở trong lô" nhưng không nói lấy từ đâu. `SubmitResult` lại đi thẳng vào response `z.strictObject` (`spend-submission.dto.ts:206-208`). Sonnet thêm field vào `SubmitResult` là có `ZodSerializationException` và 500 ở `spendBatchSubmit`. | **Đã sửa:** `sendOn` trả cặp nội bộ `{result, openedFor}`; `confirmOnCheck` trả `SpendStepRecord`; `results` giữ nguyên shape. Thêm test "response không đổi shape". |
| A2-3 | Required | Spec phân biệt xác nhận trong lô và ngoài lô bằng "`batchId` null". Nhưng lúc `confirmOnCheck` chạy trong lô thì `batchId` chưa có, vì lô được tạo sau vòng `sendOn` (`spend-batch.service.ts:96-111`). | **Đã sửa:** dùng cờ `via: 'BATCH' \| 'CONFIRMATION'` trong payload `RESERVE_CONFIRMED`. |
| A2-4 | Required | Ca sót: `reserveConfirmationCreate`, khi kiểm lại thấy Request đã vào trong số cơ sở, mở bước qua `route()` (audit `BUDGET_CHECKED`, `VIA_HEAD`, `trigger RESERVE_CONFIRMATION`) chứ không qua `confirmOnCheck`. Luật `BUDGET_CHECKED` của spec chỉ phát cho `ONE_STEP`, nên Người duyệt chi không được báo. | **Đã sửa:** thêm nhánh `VIA_HEAD && trigger RESERVE_CONFIRMATION && opened`, phát `STEP_ASSIGNED SPEND_SENT`. Đã kiểm: `route()` chạy với `VIA_HEAD` chỉ ở hai chỗ là lô và `confirm`. |
| A2-5 | Required | FX-T1 re-export lớp lỗi từ `public/`, trái `module-structure.md:188-189` (cấm `export … from`). Fork 5B cũng phát hiện lỗi này. | **Đã sửa:** chuyển lớp sang public và sửa import ở 3 file của budgets. FX-T1 tăng từ 0,5 lên 0,6 h. |
| A2-6 | Required | B7 `VENDOR_ACCOUNT_DISCREPANCY_OPENED`: chỉ `fromImport` có `applicationId`. `fromInvoiceReferral` (từ `SBF-11a`) và `fromUnlistedTools` (collector) đều có `applicationId` null. Vì vậy người nhận "IT chịu trách nhiệm ứng dụng" không xác định được, và câu `{applicationId:name}` bị hỏng. Hai hàm này cũng đang bỏ giá trị trả về của `upsertMany`. | **Đã sửa:** null thì gửi mọi IT dùng được; params cho phép null; câu VI/EN bỏ tên ứng dụng; ghi eventKey theo ngày cho collector. |
| A2-7 | Required | E1 về kiến trúc: (a) `stop-request` cần import `registry`. Nếu `registration-end` (thuộc `registry`) import ngược `stop-request` để đóng yêu cầu thì tạo vòng, gate `capability-graph` đỏ. (b) `DevicesModule` chưa import `NotificationsModule`. | **Đã sửa:** việc đóng yêu cầu `OPEN` viết trong `registry.repo.ts`. Ghi rõ phải thêm `NotificationsModule`. Đã kiểm DI an toàn: `DevicesModule` chỉ có ở graph API và CLI `record-super-admin-event`, không có ở worker hay installation. |
| A2-8 | Required | §C: `ghostSeatExemptionList` lọc theo `deciderDepartmentId`, còn list và get khuyến nghị lọc theo `departmentId` (`ghost-seat.repo.ts:136-138`). Kết quả là cùng một seat, route này thấy mà route kia không. | **Đã sửa:** IT lọc theo `recommendation.departmentId` null hoặc nằm trong phạm vi. |
| A2-9 | Optional | B1: `assigneeEmployeeIds` có thể chứa null (bước nhu cầu đang chờ người giữ). | **Đã sửa:** bỏ null. |
| A2-10 | Optional | §D chưa nói thứ tự kiểm `REQUIRED` → `INVALID` → `NOT_WORK_EMAIL`, và chưa nói giá trị lưu xuống. | **Đã sửa:** ghi thứ tự kiểm; luôn lưu `workEmail.trim()`. |
| A2-11 | Optional | `DEVICE_STOP_REQUESTED` chưa kiểm IT phụ trách có còn dùng được không, và chưa bỏ trường hợp người giữ chính là IT (tự báo cho mình). | **Đã sửa:** làm theo mẫu `department-software-notice.service.ts:27-30`; bỏ người nhận trùng người giữ. |
| A2-12 | Optional | `QĐ-111ax` còn hai route IT chưa xét: `ghostSeatOptimizationSummaryGet` (không nhận actor, số liệu tổng toàn tổ chức) và `ghostSeatRuleSkipList` (lý do bỏ qua của mọi phòng). Hai route này là số tổng hoặc chẩn đoán, không phải usage của từng người. | **Cần Owner** (khuyến nghị: giữ nguyên, ghi vào 4b nếu muốn chặn). |
| A2-13 | Optional | `SAAS_ISSUE_STATE_CHANGED`: khi một IT khác làm thay (`onBehalfOf`), IT được giao không được báo. BRD 5.5.4 chỉ đòi báo người báo. | **Ghi nhận.** Nếu muốn báo thì +0,1 h ở FX-T4b. |
| A2-14 | FYI | `peopleOf` chỉ lấy người đang được xếp phòng hôm nay. Mapping và finding của người đã nghỉ việc sẽ ẩn với mọi IT (giống tiền lệ `vendor-import-query`). G2 của người nghỉ vẫn đi qua ghost seat. | **Ghi nhận.** |
| A2-15 | FYI | Người không giữ máy gửi yêu cầu dừng thì nhận 404, trong khi `SBF-05a` ghi "đóng kèm lý do". Cách 404 theo tiền lệ của route xác nhận, không làm lộ máy tồn tại. | **Ghi nhận** (lệch có chủ ý). |
| A2-16 | Optional | `spend.http-errors.spec.ts` và `spend-batch-decision.service.spec.ts` chưa tồn tại. FX-T6 tạo cạnh capability mới mà chưa có lệnh `arch:capabilities`. | **Đã sửa:** ghi "tạo mới"; thêm lệnh kiểm. |
| A2-17 | Required (giờ) | Ước lượng thay đổi: FX-T1 +0,1, FX-T3b +0,2, FX-T9b −0,1. | **Đã sửa:** lõi ≈ 6,1 h, tổng ≈ 10,2 h. |

**Đã kiểm, khớp, không sửa:**
- Kiến trúc:
  - Tầng module: requests, usage, devices và licensing đều gọi xuống `notifications` (T1) qua `public/`.
  - `notifyInApp` trong transaction là đúng mẫu đang có. `in_app_notifications` có unique `(recipient, event_key)`, nên eventKey `SPEND_BATCH_SUBMITTED:{batchId}` dùng cho từng người nhận là đúng.
  - Khóa param không chứa `FIGURE_WORDS`.
  - Không có model mới. `DeviceStopRequest` đã có owner, đủ cột `overdueNoticedAt` và `selfHandled`, có CHECK `outcome` và unique `one_open`.
  - Migration FX-T10 chỉ đổi dữ liệu, theo tiền lệ `20261108500000`, và nằm sau `20261113102700`.
  - Ba chỗ đếm tham số đúng dòng (`:160`, `:428`, `:81`).
  - Mọi file test được nêu đều có, và đều dưới 800 dòng (gate `test-size`).
  - Các operationId dùng làm target đều có: `spendBatchGet` (vai `SPENDING_APPROVER`), `saasIssueGet`, `vendorAccountDiscrepancyList`.
- Logic:
  - `decideOne` bắt lỗi ở ngoài transaction của từng Request, nên đổi thành `skipped` là an toàn.
  - `toUnavailableApiException` chỉ khớp lỗi DB hoặc kho lưu trữ đang tạm lỗi; lỗi khác vẫn trả 500.
  - `NotCheckable` chỉ có một giá trị là `PRICE_MISSING`.
  - `finishConversion` chỉ chạy cho `ONE_STEP`.
  - Chỉ hai nơi ghi `ASSESSMENT_REQUESTED`, nên điều kiện `routingMode` của B4 tránh được báo hai lần.
- Nghiệp vụ:
  - Người nhận khớp các nguồn: BRD 5.5.4 (lô duyệt chi, bằng chứng giá, SaaS), `QĐ-99h`, `QĐ-103m`, `SBF-08` bước 4, `SBF-09`, `US-09-04`, `QĐ-101a`, `QĐ-66ae`, `QĐ-111ax`.
  - `loginEmail = workEmail`: giữ field ở dạng deprecated để FE ít vỡ nhất, vẫn đúng ý Owner.

### SPEC-5B-MESSAGES (chat B — fork)

| ID | Mức | Vấn đề | Xử lý |
| --- | --- | --- | --- |
| B2-1 | **Critical** | Spec để listener tên (EMPLOYEE/DEPARTMENT/COST_CENTER) trong `OrganizationModule` và cho module này import `NotificationsModule`. Nhưng `InstallationModule` import `OrganizationModule` (`installation.module.ts:19`), mà gate `module-graph.gate-spec.ts:451` cấm `NotificationsModule` trong graph cài đặt. | **Đã sửa A5:** đặt listener ở `organization-http.module.ts` (tiền lệ `HeldNoticeHandoverListener`), ở `catalog.module.ts` và `requests.module.ts`. |
| B2-2 | Required | Thiếu `'NotificationsModule: NotificationNameContributions'` trong `PUBLIC_CONTRACT_EXPORTS`, gate R10 sẽ đỏ. | **Đã sửa** (A5, N5a). |
| B2-3 | Required | Extension point thiếu `@Injectable()`; listener thiếu `static readonly binds` (gate `extension-wiring` kiểm). | **Đã sửa:** point tên `notifications.name-sources`. |
| B2-4 | Required | Spec ghi "dùng service đọc sẵn có", nhưng 6 kind chưa có hàm repo. N5 vượt 5 file, và 1,0 h là thấp. | **Đã sửa:** tách N5a (0,3 h) và N5b (1,1 h). |
| B2-5 | Required | A8 #15 và N7 chỉ sai nơi ghi. `GHOST_SEAT_RETURNED` được ghi ở `decision-return.service.ts:124`, còn `:64` và `:132` là mã khác. | **Đã sửa.** |
| B2-6 | Required | N7 thiếu `requests/sla/reminder-writer.service.ts:71` (`noticeParamsOf` không nhận `role`). | **Đã sửa:** thêm file và test. |
| B2-7 | Required | N3d thiếu bảng nhãn enum (A11.1 không bắt được, FE sẽ thấy chữ thô). `openapi:export` phải chạy trước test target. | **Đã sửa:** N3d tăng từ 0,6 lên 0,8 h. |
| B2-8 | Required | Template dạng "câu gốc + đuôi biến thể" (SaaS `trigger`, SBF20 `substitute`) không biểu diễn được. | **Đã sửa A4:** mỗi `case` là câu đầy đủ. |
| B2-9 | Optional | Ghép các file nhóm bằng spread thì mã trùng bị ghi đè mà không báo. | **Đã sửa:** A11.1 kiểm mã không trùng. |
| B2-10 | Optional | Hai file spec phải tạo mới. Chỉ một test assert subject cũ; không đổi `resource_type` của audit. | **Đã sửa.** |
| B2-11 | Optional | `NameKind` được khai ở 2 nơi. | **Đã sửa:** chỉ khai ở `public/notifications.extension-points.ts`. |
| B2-12 | Optional (giờ) | Phase N từ 7,0 lên 7,6 h; tổng B ≈ 9,3–10,5 h (đường dài nhất +0,6 h). | **Điều phối sửa `PLAN.md` §1.** |

Mục lượt 1: 5B-2, 5B-3, 5B-4, 5B-6, 5B-7 đã áp. 5B-1 và 5B-5 trước áp chưa đủ, lượt này đã bổ sung.
Đã kiểm khớp: số mã là 118 + 3 (A1) + 8 (A2) = 129; câu VI không tự tính số, không khẳng định thay luật (dùng "có thể"); `@RequestLocale()` hợp lệ.

### SPEC-5C-AI (chat C — fork)

| ID | Mức | Vấn đề | Xử lý |
| --- | --- | --- | --- |
| C2-1 | Required | Bản gọn cộng sai: C1–C5 (5,0) + S1–S2 (1,0) + exit code S4 (0,5) = 6,5 h, không phải 5,5 h. Thêm `.venv` thì ≈ 6,75 h. C vẫn không nằm trên đường dài nhất. | **Đã sửa.** **Điều phối sửa `PLAN.md` §1.** |
| C2-2 | Required | M1 sót tên migration cũ ở `src/modules/ai-assist/README.md:28` (`git grep` ra 4 chỗ). | **Đã sửa:** thêm bước kiểm `git grep` = 0. |
| C2-3 | Required | `pnpm rules:format` (prettier) phủ cả `docs/roadmap.md` và README module. Lời dặn "không đổi độ rộng cột" có thể làm job đỏ. | **Đã sửa:** chạy `prettier --write` cho các tệp md bị chạm. |
| C2-4 | Required | Đổi tên method của port làm vỡ mock trong `ai-purge.api.spec.ts` (dòng 17-18, 54, 64, 77, 122). | **Đã sửa** (C4, A8 #5). |
| C2-5 | Required | Repo `AI-module-SEP` chưa có `.venv`, và `uv` không có trên PATH; mọi lệnh `./.venv/Scripts/...` sẽ hỏng. | **Đã sửa:** thêm bước dựng `.venv` vào S1 (+0,25 h). |
| C2-6 | Optional | A8 #4 mô tả sai diff OpenAPI. | **Đã sửa.** |
| C2-7 | Optional | Merge `Bao_dev_be`: `openapi.json` xung đột; 5 tệp tự gộp có thể lệch nghĩa. | **Đã sửa:** ghi danh sách tệp phải đọc lại sau merge. |
| C2-8 | Nit | `.env.example` đã có chú thích. | **Ghi nhận.** |
| C2-9 | FYI | S5 (5C-Q2) và S6 (5C-Q1) nằm ngoài bản gọn. | **Ghi nhận ở Phần C.** |

Mục lượt 1: 5C-1, 5C-2 đã áp. 5C-3: lượt này chỉ dùng `merge-tree` dạng cũ, không ghi object.
Đã kiểm khớp:
- Migration chỉ có `CREATE TYPE` + `ADD COLUMN`, không cần `_values` riêng.
- `PRISMA_MODEL_OWNER` đã có.
- `ai-assist` chỉ ở graph API và CLI purge.
- Port không phải extension point.
- Lỗi P2002 vẫn ném trước `recordAdmitted`.
- Timeout 120 s nhỏ hơn mốc kẹt 150 s.
- Khớp `QĐ-102b/f/g/h`, `QĐ-79a/c`, `QĐ-78c/d`; US-15-06 nằm ngoài phạm vi.

## 3. Việc cho chat điều phối (ngoài ba spec)

1. `PLAN.md` §1: A2 lõi ~6,1 h (tổng ~10,2 h); B ~9,3–10,5 h (Phase N 7,6 h); C bản gọn ~6,75 h. Đường dài nhất vẫn là B, nay **+0,6 h**.
   Muốn về ~10 h thì cắt theo PLAN §5.
2. Trả lời A2-12: chặn hay không chặn `ghostSeatOptimizationSummaryGet`/`ghostSeatRuleSkipList` theo phòng (khuyến nghị: không, để 4b).
3. Docs `catalog/notifications.md`: dùng câu `VENDOR_ACCOUNT_DISCREPANCY_OPENED` mới (không có tên ứng dụng). `catalog/errors.md`: không đổi thêm.

## 4. Kiểm riêng `SPEND_BATCH_SUBMITTED` (Q-5A-1 = B)

| Điểm | Kết luận |
| --- | --- |
| Người nhận | Người giữ bước duyệt chi vừa mở trong lô, gồm hai loại: bước trong số cơ sở mở qua `route()`, và bước mở khi xác nhận dự phòng ngay trong lô. Bỏ `assigneeEmployeeId` null. Theo BRD dòng 290, tối đa một Người duyệt chi, nên mỗi lô có tối đa một thông báo. |
| params | `batchId`, `departmentId`, `sentCount` (số bước mở cho đúng người nhận đó). Không chứa từ cấm. Câu VI dùng số do BE trả, FE không tự tính. |
| subject / eventKey / target | `SPEND_BATCH` / `SPEND_BATCH_SUBMITTED:{batchId}` (unique theo người nhận) / `spendBatchGet`. Người duyệt chi đọc được route này. |
| Không trùng với `STEP_ASSIGNED` | Trong lô: `BUDGET_CHECKED` có `trigger SUBMISSION` nên không phát; `RESERVE_CONFIRMED` có `via BATCH` nên không phát. Ngoài lô (`reserveConfirmationCreate`): phát `STEP_ASSIGNED SPEND_SENT`, cả khi kiểm lại ra dùng dự phòng lẫn khi ra trong số cơ sở. |
| Trưởng phòng tự trình lô của mình | Request cá nhân của trưởng phòng là `ONE_STEP`, bị `lockAll` từ chối. Request `VIA_HEAD` cũ (gửi trước khi người đó thành trưởng phòng) vẫn được: báo Người duyệt chi; dự phòng của Request mình thụ hưởng thì chờ, không mở bước, không tính vào `sentCount`. Trưởng phòng là người trình nên không tự nhận. |
| Response | `results` của `spendBatchSubmit` không đổi shape (A2-2). |

## 5. Rủi ro còn lại khi code qua đêm

1. **Bẫy chỉ lộ khi chạy integration hoặc gate:**
   - CHECK của DB (`one_projection`, `stop_requests_outcome`, `one_open`).
   - Response `z.strictObject`: thêm field là 500.
   - Gate `capability-graph`, `module-graph` (installation), R10, `extension-wiring`, luật cấm re-export.

   Sonnet phải chạy `pnpm test:gates` + `pnpm arch:check` và integration theo file sau **mỗi** task, không chỉ chạy unit.
2. **A2 → B:** N3d phụ thuộc báo cáo "Thông báo mới cho 5b" của A2/A1. Task của A2 bị cắt hay đổi thì `satisfies` của B đỏ; nhãn enum thiếu thì không test nào bắt được. B phải đọc báo cáo, không chỉ đọc §1.B.
3. **Xung đột merge:** `notifications.types.ts` và `inbox.policy.ts` (A1, A2, B); `parameter-definitions.policy.ts` và 3 chỗ đếm (A1, A2, C); `openapi.json` (luôn xuất lại). Dải timestamp migration đã cấp trước (A2 `…1000xx`, A1 `…1100xx`, C `…120000`).
4. **FX-T3b là task dễ sai nhất của A2:** có hai đường mở bước và hai cách phân biệt (`trigger`, `via`). Phải đủ 4 ca test: lô + trong số cơ sở; lô + xác nhận dự phòng; xác nhận riêng còn dùng dự phòng; xác nhận riêng nay trong số cơ sở.
5. **C:**
   - `rules:format` có thể đỏ vì bảng roadmap.
   - Tệp tự gộp lúc merge `Bao_dev_be` có thể lệch nghĩa.
   - `queue-summary-approver.integration-spec.ts:144` đã đỏ sẵn (nợ FIX-TEST), đừng tưởng do merge.
   - `git rm --cached -r . && git reset --hard` ở S1 chỉ chạy trên bản checkout sạch.
6. **Nợ test cũ:** test cũ vỡ vì harness thì ghi vào "Nợ test cho FIX-TEST", không sửa tại chỗ. Thấy lỗi logic (500, sai tiền/luồng) thì sửa ngay.
7. **`pnpm check` và test toàn bộ chưa chạy ở bước spec.** CI đầy đủ trên `feat/p5` là cổng cuối (PLAN §3.5).
