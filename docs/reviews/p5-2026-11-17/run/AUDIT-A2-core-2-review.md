# AUDIT-A2-core-2 — review chỉ đọc vùng FX-T8, FX-T9a, FX-T9b, FX-T10 (17/11/2026)

**Skill đã đọc/dùng (Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`):**
- `agent-skills:code-review-and-quality`: dùng làm process + domain. Review theo 5 trục, gắn mức Critical/Required/Optional/Nit.
- `superpowers:verification-before-completion`: dùng làm verification. Mọi kết luận đều trích `file:dòng` đã đọc bằng `git show 7d8586d5:<path>`.
  Không chạy test/pnpm/docker vì đề bài cấm. Vì vậy mọi nhận định "test bắt được / CI đỏ" ở đây đều là **lập luận tĩnh**, chưa có kết quả chạy.
- Mapping: không có skill "review backend NestJS" riêng; `code-review-and-quality` là skill gần nhất.

**Phạm vi:**
- Repo `D:\FPT\FALL2026\Code\be-p5-a2`, nhánh `feat/p5-a2-fixes`, lõi `94a8ee84..7d8586d5`. Chỉ đọc qua git.
- Commit thuộc vùng này:
  - `8a3e32e3` FX-T8;
  - `6d1bad22` FX-T9a;
  - `6de273f9` FX-T9b;
  - `7d8586d5` FX-T10.
- Nguồn đối chiếu:
  - `SPEC-5A-FIXES.md` §1 E, F, §2, §6, §7, §9;
  - `REVIEW-SPECS-2.md` A2-1, A2-7, A2-11, A2-15, §5;
  - `PLAN.md` (đếm tham số);
  - BRD `FR-4.18`, `BR-45.9`;
  - sổ QĐ (`QĐ-111ax`, `QĐ-58b`, `QĐ-100z`);
  - `SBF-05a`;
  - `docs/rules/module-structure.md`, `docs/rules/api-contract.md`, `scripts/arch/tiers.cjs`;
  - `Tool-wdp` (`ai_collector/be_uploader.py`, `be_batch.py`, `be-integration/plan.md`, `QUICKSTART-TEST.md`).
- D-n: chưa có `A2-DONE.md`. Bốn commit chỉ có tiêu đề, không có body, nên **không có D-n nào được ghi**. Các chỗ lệch spec mà
  review tìm thấy được ghi thành finding (O1) hoặc FYI (F2).

## Kết luận

- Không có Critical.
- Trong code BE không có Required. Có **1 Required ngoài repo BE** (R1, tài liệu demo của Tool-wdp lệch contract).
- 5 Optional, 5 Nit, 4 FYI.
- **Vùng FX-T8/T9a/T9b/T10 merge được vào `feat/p5`** khi CI đầy đủ xanh. Review này không chạy test nên không thể khẳng định CI xanh.
  R1 sửa trong `Tool-wdp`, không chặn merge BE, nhưng phải sửa trước khi chạy bước 7 của kịch bản demo.

Những điểm đã kiểm và khớp (tóm tắt):

**FX-T9a, FX-T9b (dừng thu thập):**
- **Khóa và đua:**
  - `lockRegistrationChain` khóa máy rồi khóa đăng ký bằng `FOR UPDATE` (`registry.repo.ts:134-141`). Hai lời tạo cùng lúc vì vậy chạy
    nối tiếp; lần sau đọc lại thấy `OPEN` và ghi `INVALID DUPLICATE`.
  - Unique một phần `device_stop_requests_one_open` chỉ còn là lớp phòng thủ. Repo bắt đúng tên index (`stop-request.repo.ts:113`).
- **CHECK của DB:**
  - `setCollectionStopped` đặt hai cột trong một `UPDATE` (`registry.repo.ts:202-206`), khớp CHECK `one_projection` (A2-1).
  - Dòng `INVALID` có `handled_at` (`stop-request.repo.ts:106`), khớp CHECK `outcome`.
- **Thứ tự kiểm khi tạo:** không phải người giữ ⟹ 404; đăng ký đã kết thúc ⟹ 409; rồi `ALREADY_STOPPED`, rồi `DUPLICATE`
  (`stop-request.service.ts:67-76`). Đúng §E1 và A2-15.
- **Hoàn tất:**
  - Khóa đăng ký rồi đọc lại yêu cầu dưới khóa (`stop-request-completion.service.ts:34-48`).
  - Không thu hồi credential (AC-12).
  - `selfHandled` đúng AC-7.
  - Có audit `{selfHandled}`.
- **`dueAt`:** `slaDueAt` cộng 2 ngày làm việc, giữ nguyên giờ, theo múi giờ tổ chức. VN không có DST. Lịch ngày nghỉ đọc 30 ngày tới.
  Unit test có ca thứ Hai, thứ Sáu và ngày lễ.
- **Kiến trúc:**
  - `stop-request` → `registry` (chiều thuận). `registry` không import `stop-request`, vì câu đóng yêu cầu viết trong `registry.repo.ts`
    (A2-7).
  - Cạnh `devices` (tầng 5) → `operating-parameters` (tầng 3) hợp lệ theo `tiers.cjs`.
  - Không có bảng mới. Bảng `device_stop_requests` nhận quyền mặc định `SELECT, INSERT, UPDATE, DELETE` của `slm_runtime`, vì không nằm
    trong `RUNTIME_TABLE_EXCEPTIONS`. H7 không bị ảnh hưởng.
- **Kết thúc đăng ký:** mọi đường kết thúc (đổi người giữ, ngừng dùng, nghỉ việc, chặn) đều đi qua `RegistrationEndService.end`
  (`registration-end.service.ts:25-59`). Hàm này gọi `invalidateOpenStopRequests` trong cùng transaction và dưới khóa của người gọi.
- **Phân quyền và SoD:**
  - Chỉ người giữ tạo được yêu cầu. IT, trưởng phòng hay Super Admin gửi thay ⟹ 404 (có test).
  - `deviceStopRequestList` và `deviceStopRequestComplete` chỉ cho `IT_ADMIN` (có test 403).
  - Body `{}` strict (có test 422).

**FX-T8 (allowlist theo ngày):**
- `evaluateDays` chỉ bỏ riêng công cụ không có trong allowlist của ngày đó. Coverage được xét trên phần còn lại. Ngày bị bỏ hết thì
  `REJECTED NOT_IN_ALLOWLIST` (`ai-usage-day.policy.ts:73-84`).
- `COLLECTOR_UNLISTED` so với bản allowlist hiện hành (`ai-usage-batch.service.ts:92-99`).
- Shape response không đổi.
- ADR-13 giữ được: không có dòng usage nào ngoài allowlist của ngày đó được ghi.
- Tool chỉ gửi công cụ có trong allowlist của session (`Tool-wdp/ai_collector/be_batch.py:61-79`). Contract upload không đổi.

**FX-T10 (gỡ tham số ZBB):**
- Migration chỉ đổi dữ liệu và chạy lại được (`valid_to IS NULL`).
- Đóng giá trị bằng `GREATEST(CURRENT_TIMESTAMP, valid_from)`, theo đúng tiền lệ `20261108500000`.
- Có `RAISE NOTICE` khi giá trị khác mặc định. VPS có giá trị do Finance sửa vẫn an toàn: không xóa dòng, chỉ đóng.
- Tên migration nằm trong dải của A2 và sau `20261113102700`.
- Số định nghĩa: 29 trên `dev`, 27 trên nhánh. Cả ba chỗ đếm đều là 27:
  - `parameter-definitions.policy.spec.ts:165` + `EXPECTED_KEYS`;
  - `operating-parameters-http.integration-spec.ts:463`;
  - `api-collection-registry-exceptions.ts:81`.
- Không còn chỗ nào trong `src`, `test` hay seed đọc hai khóa này. Chỉ còn nhắc trong `docs/workspace` cũ.

**Kích thước file:** các file test và support đều dưới trần của gate: integration 800 dòng, support 400 dòng, mỗi thư mục 25 file
(`stop-request/` có 11 file).

---

## Required

### R1 — Required (ngoài repo BE, không chặn merge BE) — kịch bản demo của Tool-wdp gọi sai route hoàn tất và đọc sai field id

- **Vị trí:**
  - Bên tool: `D:\FPT\FALL2026\Code\Tool-wdp\be-integration\plan.md:146-149`.
  - Bên BE ở `7d8586d5`: `src/modules/devices/stop-request/stop-request.controller.ts:80` (response `{ stopRequest: … }`) và `:107`
    (route `device-stop-requests/:id/completion`).
- **Kịch bản lỗi:**
  - Bước 7 của demo chạy `STOP=$(post … /stop-requests '{}' | jget data.id)`. BE trả `data.stopRequest.id`, nên `data.id` không tồn tại:
    `jget` ném `KeyError` và `STOP` rỗng.
  - Lệnh sau gọi `post "$IT" "/device-stop-requests/$STOP/completions"`, tức route số nhiều với id rỗng. Kết quả là 404 route.
  - Máy không bao giờ chuyển sang `COLLECTION_STOPPED`. `be-upload` không thoát 4, nên bước 7 của demo vẫn hỏng.
  - Đây đúng là lý do spec xếp FX-T9 vào lõi (§5: "bước 7 kịch bản demo đang 404").
- **Căn cứ:** spec §E1 chốt route `POST /device-stop-requests/{id}/completion` và body trả `{stopRequest}`. BE làm đúng spec; tài liệu
  tool viết theo bản phác thảo cũ. Comment ở `plan.md:146` cũng còn ghi `MyDevice.stopRequest.id`, trong khi BE chỉ có
  `stopRequestPending: boolean`.
- **Cách sửa:**
  - Trong `plan.md:148`: đổi `jget data.id` thành `jget data.stopRequest.id`.
  - Trong `plan.md:149`: đổi `/completions` thành `/completion`.
  - Sửa comment `:146` thành "nhân viên yêu cầu (⟹ `data.stopRequest.id`; `GET /me/devices` có `stopRequestPending`)".
  - Không đổi BE.
- **Test:** chạy lại bước 7 trên BE local. Mong đợi:
  - lệnh tạo trả 201 với `state: OPEN`;
  - lệnh hoàn tất trả 200 với `COMPLETED`;
  - `be-session` trả `COLLECTION_STOPPED`;
  - `be-upload` có `exit=4` và đã xóa `be-upload-state.json`.

---

## Optional

### O1 — Optional — `handled_at` của yêu cầu bị đóng vì đăng ký kết thúc lấy mốc kết thúc, không lấy "now" như spec; có thể sớm hơn `requested_at`

- **Vị trí:** `src/modules/devices/registry/registration-end.service.ts:36`, `src/modules/devices/registry/registry.repo.ts:213-218`.
- **Kịch bản:**
  - `BlockMomentEffects.apply` kết thúc đăng ký với `end.at = moment.at` (`personnel/departure-deadline/block-moment-effects.service.ts:42-46`).
    Mốc này là thời điểm chặn đã tính trước, và sweep có thể chạy muộn hơn.
  - Nếu người giữ gửi yêu cầu dừng trong khoảng giữa `moment.at` và lúc sweep chạy, dòng sẽ có `handled_at < requested_at`, tức "xử lý
    trước khi được gửi". Không vi phạm CHECK nào, nhưng báo cáo hay SLA tính `handled_at - requested_at` sẽ ra số âm.
  - Spec §E1 ghi "`INVALID REGISTRATION_ENDED`, `handled_at = now`". Code dùng `input.at`. Đây là lệch spec không có D-n.
- **Cách sửa:**
  - Cách 1: `handled_at = GREATEST(${at}, requested_at)` trong câu `UPDATE`.
  - Cách 2: truyền `now` riêng.
  - Nếu cố ý dùng `at`, ghi D-n trong `A2-DONE.md`.
- **Test:** integration trong `devices-stop-request.integration-spec.ts`:
  1. Tạo yêu cầu.
  2. Gọi `DevicesApi.endRegistrationsOfHolder` (hoặc nhánh chặn) với `at = now - 1h`.
  3. Kiểm `handled_at >= requested_at`.

### O2 — Optional — hệ thống đóng yêu cầu (`REGISTRATION_ENDED`) mà không ghi audit cho chính yêu cầu

- **Vị trí:** `registry.repo.ts:213-218` (gọi từ `registration-end.service.ts:36`), `stop-request-completion.service.ts:43-47`
  (`closeAsRegistrationEnded`).
- **Kịch bản:** truy vết `DeviceStopRequest` theo `resource_id` chỉ thấy `CREATED`. Trạng thái `OPEN → INVALID` không có sự kiện nào.
  Hai chuyển trạng thái do người làm (tạo, hoàn tất) đều có audit, nên đây là chuyển trạng thái duy nhất bị thiếu. Spec không bắt buộc,
  nên xếp Optional.
- **Cách sửa:**
  - `invalidateOpenStopRequests` dùng `RETURNING id`.
  - `RegistrationEndService.end` ghi `DEVICE_STOP_REQUEST.INVALIDATED` (actor = `by`, `after {state:'INVALID', invalidReason:'REGISTRATION_ENDED'}`)
    cho từng id.
- **Test:** mở rộng ca "a registration that ends while a request is open" (`devices-stop-request.integration-spec.ts:293`). Kiểm
  `audit_events` của `created.id` là `[CREATED, INVALIDATED]`.

### O3 — Optional — `deviceStopRequestList` đếm và lấy trang ở hai snapshot khác nhau

- **Vị trí:** `src/modules/devices/stop-request/stop-request.repo.ts:144-161` (`Promise.all` của `findMany` và `count`, không có
  transaction).
- **Căn cứ:** `docs/rules/api-contract.md:92`: "Đếm và trang dùng cùng snapshot (một transaction `RepeatableRead`) khi tổng phải khớp
  trang". `my-devices.repo.ts:29-43`, cùng module, làm đúng. `registry-query.repo.ts` cũng dùng `Promise.all`, nên tiền lệ trong repo
  đang lẫn lộn; vì vậy chỉ xếp Optional.
- **Kịch bản:** IT hoàn tất một yêu cầu đúng lúc người khác đang đọc trang `state=OPEN`. `totalItems` có thể lệch 1 so với số dòng.
  FE tính `totalPages` sai và hiện trang cuối rỗng.
- **Cách sửa:** bọc hai câu trong `this.prisma.$transaction(async (tx) => …, { isolationLevel: 'RepeatableRead' })`, như `my-devices.repo.ts`.
- **Test:** không cần test đua. Nếu dự án theo dõi bằng `test/support/query-count.ts`, thêm kiểm "một transaction" như các repo đã sửa.

### O4 — Optional — FX-T8 nay mở mục rà soát `COLLECTOR_UNLISTED` cho công cụ vừa bị **gỡ** khỏi allowlist, kể cả ở ngày được nhận; chưa có test chốt hành vi này

- **Vị trí:** `src/modules/usage/ai-usage/ai-usage-batch.service.ts:93-99`. Điều kiện quét gồm cả `reason === null` và
  `INVALID_COVERAGE`, so với bản hiện hành.
- **Kịch bản:**
  - Trước FX-T8, chỉ ngày `NOT_IN_ALLOWLIST` mới được quét.
  - Bây giờ, nếu IT gỡ `ANTIGRAVITY_CLI` lúc 10:00 mà lô gửi số của chính ngày đó (allowlist của ngày vẫn có công cụ, nên ngày được
    nhận), thì công cụ này đồng thời bị ghi thành "phần mềm công ty không quản lý".
  - Spec §E2 viết đúng như vậy ("không có trong allowlist đang hiệu lực lúc nhận"). Với tool thật, ca này hầu như không xảy ra, vì tool
    đọc session ngay trước khi gửi (`be_uploader.py:166-180`).
  - Tuy vậy, ca `usage-intake.integration-spec.ts:262-266` (gửi `ANTIGRAVITY_CLI` ngay sau khi gỡ) bây giờ âm thầm sinh một
    discrepancy mà không ai kiểm.
- **Cách sửa:** giữ nguyên code, nhưng chốt hành vi bằng test. Nếu Owner muốn không báo công cụ vừa gỡ thì đổi điều kiện thành
  "không có trong allowlist của ngày **và** không có trong bản hiện hành". Hướng này cần D-n.
- **Test:** trong ca `:241`, sau lần gửi `ANTIGRAVITY_CLI` ở `:264`, kiểm
  `SELECT count(*) FROM vendor_account_discrepancies WHERE source='COLLECTOR_UNLISTED' AND source_ref='ANTIGRAVITY_CLI'` bằng 1 (hoặc 0 nếu
  đổi luật).

### O5 — Optional — module card còn mô tả hành vi cũ

- **Vị trí:**
  - `src/modules/devices/README.md:52-54`: mục "Chưa làm" còn ghi "Yêu cầu dừng và SLA". Danh sách capability ở `:29-39` chưa có
    `stop-request/`.
  - `src/modules/usage/README.md:66`: còn ghi "`ai-usage-batch.service.ts` gọi khi từ chối `NOT_IN_ALLOWLIST`", trong khi nay so với
    allowlist hiện hành.
- **Căn cứ:** `AGENTS.md:10-11` coi module card là nguồn "API làm gì hôm nay". Lõi sẽ merge vào `feat/p5` trước FX-T11, và chat B đọc
  module card. FX-T11 có trong danh sách được cắt (§5 mục 5).
- **Cách sửa:**
  - Thêm `stop-request/` vào danh sách capability và vào chuỗi không vòng (`notice → registry → acknowledgement/stop-request → my-devices`).
  - Xóa "Yêu cầu dừng và SLA" khỏi mục "Chưa làm"; ghi phần còn thiếu là thông báo và sweep quá hạn (FX-T9c).
  - Sửa câu ở `usage/README.md:66`.
- **Test:** không cần; chạy `pnpm arch:docs:check` nếu gate có đọc card.

---

## Nit

- **N1** — `test/integration/usage/usage-intake.integration-spec.ts:241`: tiêu đề đổi thành "…dropped alone", nhưng thân test không có
  ca nào bỏ riêng một công cụ (chỉ có ca bỏ cả ngày bằng `ANTIGRAVITY_CLI`). Nên trả tiêu đề về đúng nội dung, vì ca mới ở `:410` đã phủ.
- **N2** — Hai nhánh phòng thủ không thể chạy tới và không có test:
  - Retry `DeviceStopRequestOpenRaceError` (`stop-request.service.ts:49-56`) không chạy tới được vì đã khóa `FOR UPDATE` trước.
  - `closeAsRegistrationEnded` trong hoàn tất (`stop-request-completion.service.ts:43-47`) không chạy tới được sau FX-T9b, vì kết thúc
    đăng ký đã đóng mọi `OPEN` dưới cùng khóa.
  - Giữ thì thêm unit test có mock (repo ném lỗi race một lần ⟹ `attempt` chạy lại). Bỏ thì thay bằng comment ngắn.
- **N3** — `ai-usage-batch.service.ts:73,92`: đọc allowlist hai lần (`versions` rồi `current`). Có thể lấy bản cuối từ `versions` đã
  đọc, đỡ một query mỗi lô.
- **N4** — Mô tả OpenAPI của `aiUsageBatchCreate` (`ai-usage.controller.ts:53-57`) chưa nói rằng công cụ không được phép trong ngày bị
  bỏ **im lặng**, và ngày chỉ `REJECTED NOT_IN_ALLOWLIST` khi bị bỏ hết. Đây là điểm Breaking FE §9.4, nên ghi vào mô tả để FE và tool
  đọc được.
- **N5** — `stop-request.dto.ts:30`: mô tả `dueAt` ("Two working days after…") cũng hiện cho dòng `INVALID`. Nên thêm "chỉ có nghĩa khi
  `OPEN`", để FE không hiện hạn cho yêu cầu trùng.

## FYI

- **F1** — `FR-4.18`/`FR-10.5` (IT được báo yêu cầu mới) và AC-5 (sweep quá hạn) thuộc FX-T9c, nằm ngoài lõi. Sau khi merge lõi, IT chỉ
  thấy yêu cầu khi mở `deviceStopRequestList` (có cờ `overdue`). Đúng thứ tự cắt ở §5.
- **F2** — Không có `A2-DONE.md` và commit không có body, nên chưa ghi D-n nào. Lệch không ghi chép: O1 (`handled_at`). Chọn lựa theo spec
  nhưng nên ghi rõ: O4.
- **F3** — `6d1bad22` sinh lại `docs/generated/module-graph.md`. Bản sinh lại kéo theo cả cạnh `requests → budgets 30→32` và
  `requests → notifications 12→13` của FX-T1/FX-T3. Vậy tại các commit từ `8eda00c2` đến `8a3e32e3`, `arch:docs:check` nhiều khả năng đỏ
  (khó bisect). Điểm này thuộc vùng của agent kia; tại HEAD đã khớp.
- **F4** — `deviceStopRequestList` không lọc theo phòng phụ trách. Điều này khớp spec ("Mọi IT Admin hoàn tất được"). `QĐ-111ax` chỉ chặn
  **đọc usage**, còn hàng đợi yêu cầu dừng là thao tác ghi, nên "IT khác xử lý thay" (`QĐ-58b`) vẫn áp.

## Lập luận mutation (tĩnh, chưa chạy)

| Mutation ở chỗ chính | Test bắt |
| -- | -- |
| Bỏ `acknowledged_from = NULL` trong `setCollectionStopped` | CHECK `23514` ⟹ 500. Các ca `:81`, `:243` dùng `h.collected` (đã xác nhận) đỏ |
| Bỏ `hasOpen` | Lần 2 vướng unique ⟹ retry ⟹ lại `23505` ⟹ 500. Ca `:135` và `:157` đỏ |
| Bỏ kiểm `collectionStoppedAt` | Ca `:135` (mong `ALREADY_STOPPED`) đỏ |
| Bỏ kiểm người giữ | Ca `:172` (404 cho người khác và IT) đỏ |
| Bỏ `RequireRoles('IT_ADMIN')` | `:131`, `:240` (403) đỏ |
| `selfHandled` luôn `false` | `:189` đỏ |
| Bỏ `invalidateOpenStopRequests` | `:293` (DB còn `OPEN`) đỏ |
| `dueAt` theo ngày lịch | Unit `stop-request.policy.spec.ts` (ca thứ Sáu ⟹ thứ Ba) đỏ |
| FX-T8: xét coverage trên `day.tools` | Unit `ai-usage-day.policy.spec.ts` ("judges the coverage on what is left") đỏ |
| FX-T8: `unlisted` so với allowlist của ngày | Unit "does not tell the review…" và integration `:410` (`unlistedClaude() == 0`) đỏ |
| FX-T10: bỏ `UPDATE` trong migration | Integration `operating-parameters-http:412` (`valid_to` khác null) đỏ |
| Retry race bị bỏ | **Không test nào bắt** (nhánh không chạy tới được, N2) |

**CI có thể đỏ:** đọc tĩnh không thấy test nào sẽ đỏ trong vùng này. Các chỗ đã kiểm:
- shape strict của `/me/devices`: cả hai nơi map đã thêm field;
- registry ví dụ OpenAPI;
- số đếm tham số;
- trần kích thước file;
- `DISABLE TRIGGER USER` trong test FX-T8: có tiền lệ, và mỗi file integration có DB riêng.

Chưa chạy nên chưa xác nhận được; cổng cuối là CI đầy đủ trên `feat/p5`.
