# AUDIT B — Phase N (SPEC-5B thông báo có chữ) — review chỉ đọc

Phạm vi: repo `Code/be-p5-b`, nhánh `feat/p5-b-messages`, `94a8ee84..8a6c9ae1` (N1, N2, merge N3a/N3b, N3c, N4, N5a, N5b, N6, N7).
Chưa có N3d và Phase E, nên review không tính hai phần này là thiếu. Ngày 17/11/2026.

## Skill đã đọc/dùng

- `agent-skills:code-review-and-quality`: dùng làm skill process cho review (không có skill process riêng cho review chỉ đọc nên lấy
  skill này thay) và làm khung review năm trục, cách đặt mức Critical/Required/Optional/Nit.
- `superpowers:verification-before-completion` (verification): mỗi kết luận đều có bằng chứng là code đọc ở `8a6c9ae1`, script so catalog
  hoặc log CI. Không suy từ báo cáo của chat B.

## Cách kiểm (không sửa repo, không chạy pnpm/jest/docker)

- Đọc code bằng `git diff 94a8ee84..8a6c9ae1` và `git show 8a6c9ae1:<path>` cho toàn bộ 74 file trong diff.
- Có so tự động với catalog. Cách làm: `git show` 7 file mẫu câu và nhãn ra scratchpad, transpile bằng `typescript` của repo (chỉ đọc
  `node_modules`), rồi so với `Docs/Figma UI-UX/API-Integration/catalog/notifications.md`. Phạm vi so gồm tiêu đề, mọi nhánh câu vi/en của
  **118/118 mã** và 56 giá trị nhãn enum đọc được từ cột "Ghi chú".
- Đọc CI bằng `gh run view 43962777729` và log job `quality`. Lúc review, run vẫn đang chạy: job `quality` **đỏ**; `http-contract`,
  `e2e-smoke`, `integration (1)` và `integration-inband` xanh; `integration (2)/(3)` chưa xong.

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 4 | R-1 CI `quality` đỏ · R-2 `SPEND_QUEUE_REMINDER` không bao giờ ra câu của trưởng phòng · R-3 thiếu câu "người nhận là chính đương sự" của catalog · R-4 test A11 không ép biến có thể vắng phải nằm trong `[ ]` (A10), dẫn tới câu hỏng thật |
| Optional | 8 | O-1…O-8 |
| Nit | 5 | N-1…N-5 |

So catalog:

- Đã so **118 mã** (tiêu đề và mọi nhánh, vi + en). **90 mã** khớp từng ký tự. 28 mã có nhánh khác: 19 mã khác có lý do (thêm `otherwise`,
  bọc `[ ]` theo ghi chú "bỏ khi null" của catalog, biến thể tương đương với `[Không có phương án thay thế.]`…). Phần còn lại là lệch thật,
  liệt kê ở R-2, R-3, O-2, O-7.
- Có **9 mã lệch cần xử lý hoặc cần ghi lại**:
  - phải sửa: `SPEND_QUEUE_REMINDER`, `EMPLOYEE_PROFILE_UPDATED`, `TRANSFER_RIGHTS_REVOKING`, `PERSONNEL_EVENT_RECORDED`, `REQUEST_RETURNED`;
  - chỉ ghi Docs: `STEP_SLA_REMINDER` (D-N9), `BUDGET_ADJUSTMENT_DECIDED`, `SUBSCRIPTION_RENEWAL_ALERT` (N3d viết lại);
  - được phép theo spec A4: `POLICY_PUBLISHED` (`{policyCode}` để thô).
- Nhãn enum: 56 giá trị, **0 lệch** vi/en. Các khác biệt script báo đều do cách tách chú thích "vi / en", "(EN: …)" của catalog. Nhãn
  `configurationHint`, `NO_HEAD` đã có.

Kết luận: **Phase N chưa đạt.** Kiến trúc, contract, render "không ném" và tra tên theo lô đều đúng. Còn 4 Required: CI đỏ, một câu
sai người nhận do lỗi renderer gặp bảng, câu theo người nhận của catalog bị bỏ, và test A10 không có nên đã có câu hỏng. Cả 4 sửa nhỏ,
khoảng 1–1,5 giờ Sonnet.

---

## Required

### R-1 — CI `quality` đỏ: `docs/generated/module-graph.md` lỗi thời (Required)

- **Ở đâu:** `docs/generated/module-graph.md` không có trong diff. Script kiểm là `scripts/arch/graph.mjs --check`.
- **Bằng chứng:** log job `quality` (id 133634424269) của run 43962777729:
  `docs/generated/module-graph.md is out of date: run \`pnpm arch:graph\` and commit it.` ⟹ `ELIFECYCLE exit code 1`. Trước bước này,
  unit 544/544 và gates 337/337 xanh, depcruise sạch. Lệnh `routes.mjs --check` đứng sau nên chưa chạy.
- **Kịch bản:** N5a/N5b thêm điểm mở `notifications.name-sources` và 5 bên đăng ký, nên graph sinh ra đổi. B-DONE ghi "`arch:check` sạch"
  nhưng không chạy `arch:graph --check` hoặc chạy trước N5b.
- **Sửa:**
  1. Chạy `pnpm arch:graph` (và `pnpm arch:routes` nếu script báo), commit file sinh ra.
  2. Chạy lại `node scripts/arch/graph.mjs --check && node scripts/arch/routes.mjs --check`, rồi chờ run CI mới xanh **toàn bộ**,
     kể cả `integration (2)/(3)`.
  3. Sửa dòng N6 trong B-DONE.

### R-2 — `SPEND_QUEUE_REMINDER`: nhánh `cause = null` không bao giờ được chọn, trưởng phòng nhận câu sai (Required)

- **Ở đâu:**
  - `src/modules/notifications/inbox/notification-text/notification-texts-mf1-sla.types.ts:87` (vi) và `:100` (en): `cases: { null: '…' }`;
  - `src/modules/notifications/inbox/notification-text/inbox-notification-text.policy.ts:227-231` (`branchOf`) và `:144-154` (`rawOf`).
- **Kịch bản:**
  - `requests/sla/step-sla.policy.ts` `queueRecipientsOf` ghi `cause: null` cho trưởng phòng. Đây là người nhận chính (catalog:
    "`null` khi gửi cho trưởng phòng").
  - `rawOf(null)` trả `undefined`, nên `branchOf` luôn lấy `otherwise`. Hậu quả: trưởng phòng đọc "Yêu cầu X chờ trình duyệt chi quá hạn
    (nhắc lần 2)." thay cho câu catalog "…đã chờ trong hàng đợi **của bạn**… **Vui lòng trình duyệt chi.**".
  - en cũng mất "Please send it for spend approval.". Ca `null` là code chết.
- **Vì sao test không bắt:** `notification-text.table.spec.ts:130,159` sinh mẫu `{ cause: 'null' }` (chuỗi), nên ca `null` vẫn được
  "chọn" trong test.
- **Sửa:**
  1. Trong cả vi và en, đưa câu của ca `null` vào `otherwise` (vắng hoặc `null` đều là trưởng phòng; hàng cũ cũng vậy) và xóa key `null`.
  2. Thêm vào `problemsOf` (`notification-text.table.spec.ts:72`): một biến thể có key ca là `'null'` hoặc `'undefined'` là lỗi
     ("unreachable case: params null/absent select `otherwise`").
  3. Thêm test cụ thể:
     - `renderNotificationText('SPEND_QUEUE_REMINDER', { requestId, reminderNumber: 2, overdueWorkingDays: 1, cause: null }, 'vi', names)`
       phải chứa `'Vui lòng trình duyệt chi.'`;
     - bản en của lời gọi trên phải chứa `'Please send it for spend approval.'`;
     - `cause: 'NO_HOLDER'` phải chứa `'bổ nhiệm trưởng phòng'`.
- **Mutation phải đỏ:** thêm lại `null:` vào `cases`, hoặc đổi `otherwise` về câu chung.

### R-3 — Thiếu câu "người nhận là chính đương sự" của catalog (Required)

- **Ở đâu:**
  - `notification-texts-org.types.ts:152` (`TRANSFER_RIGHTS_REVOKING`);
  - `:188` (`EMPLOYEE_PROFILE_UPDATED`);
  - `:199` (`PERSONNEL_EVENT_RECORDED`);
  - `src/modules/notifications/inbox/inbox-view.service.ts:32` (`view` không biết người nhận);
  - `src/modules/notifications/inbox/inbox.controller.ts:74,141`.
- **Căn cứ:**
  - Catalog ghi rõ câu riêng:
    - `EMPLOYEE_PROFILE_UPDATED`: "Hồ sơ của bạn vừa được cập nhật thông tin chính thức." / "Your profile's official details were just updated.";
    - `TRANSFER_RIGHTS_REVOKING`: "{rightCount} quyền phần mềm của phòng cũ của bạn đang được thu hồi.";
    - `PERSONNEL_EVENT_RECORDED`: thay "{employeeId:name}" bằng "Bạn".
  - Cả ba mã đều gửi cho chính nhân viên (cột "Người nhận").
  - Spec 5B §A4: "Câu chép sai/thiếu so với catalog là lỗi review". B-TEXTS-DONE quyết định 2 bỏ các câu này vì "renderer không biết
    người nhận". Nhưng route biết `actor.employeeId`, và B-DONE không ghi D-N nào cho chỗ lệch này.
- **Kịch bản:** nhân viên mở hộp thư và đọc "Hồ sơ của Nguyễn Văn A vừa được cập nhật…" về chính mình. Test integration hiện còn khóa
  hành vi sai này: `test/integration/notifications/in-app-notifications.integration-spec.ts` ca 'says the real name…' gửi
  `EMPLOYEE_PROFILE_UPDATED` cho chính `grace` rồi `expect(profile?.message).toContain(employeeName)`.
- **Sửa** (giữ contract, `params` trên dây không đổi):
  1. Đổi chữ ký thành `InboxViewService.view(records, locale, recipientEmployeeId)`. Controller truyền `actor.employeeId`.
  2. Khi render (không đưa ra wire), dùng `renderParams = { ...record.params, recipientIsSubject: String(record.params.employeeId === recipientEmployeeId) }`.
     Dùng chung giá trị này cho `nameRefsOf`.
  3. Với `EMPLOYEE_PROFILE_UPDATED` và `TRANSFER_RIGHTS_REVOKING`: `message` thành biến thể `{ by: 'recipientIsSubject', cases: { true: <câu catalog cho chính người đó> }, otherwise: <câu hiện tại> }`,
     làm cho cả vi và en.
  4. Với `PERSONNEL_EVENT_RECORDED` (đang có biến thể `by: eventKind`): `InboxViewService` truyền map tên có
     `nameLookupKey('EMPLOYEE', recipient)` = `'Bạn'`/`'You'` riêng cho mã này. Cách khác: thêm một tầng biến thể. Cách đầu ít đổi hơn.
  5. Trong test bảng: thêm hằng `RENDER_ONLY_KEYS = ['recipientIsSubject']`, được phép làm `by`. Cập nhật `allowedKeys` ở `problemsOf`.
  6. Unit `inbox-view.service.spec.ts`: recipient trùng `employeeId` thì câu là "Hồ sơ của bạn…"; khác thì câu có tên.
  7. Sửa assert integration nêu trên: `grace` nhận về chính mình thì là câu "Hồ sơ của bạn…". Thêm một ca trưởng phòng nhận thì có tên.
- **Mutation phải đỏ:** bỏ truyền `recipientEmployeeId`, hoặc bỏ ca `true`.

### R-4 — Test A11 không thực thi A10: biến có thể vắng nằm ngoài `[ ]` sinh ra câu hỏng (Required)

- **Ở đâu:**
  - `notification-text.table.spec.ts:72-118` và `:154-161`;
  - các mẫu câu ở `notification-texts-mf1-sla.types.ts:57` (`STEP_SLA_ESCALATION`);
  - `notification-texts-mf1.types.ts:185` (`STEP_ASSIGNED`) và `:354` (`REQUEST_BUDGET_VERSION_ENDED`);
  - `notification-texts-org.types.ts:176` (`EMPLOYEE_PROFILE_CREATED`);
  - `RETURN_REQUESTED`, `REQUEST_AWAITING_BUDGET`.
- **Căn cứ:** Spec A10: "test A11 ép mẫu đặt biến có thể vắng trong `[ ]` hoặc biến thể". Test hiện chỉ kiểm không còn `{ } [ ] null…`.
  Biến vắng ngoài `[ ]` thành chuỗi rỗng, sau đó `replace(/ {2,}/g,' ')` che khoảng trống, nên test xanh dù câu hỏng.
- **Kịch bản** (giá trị `null` hợp lệ theo cột `params` của catalog):

  | Mã | Biến vắng | Câu ra |
  | --- | --- | --- |
  | `STEP_SLA_ESCALATION` | `holderEmployeeId` (`uuid \| null`) | "Bước duyệt chi của yêu cầu X **do phụ trách** đã quá hạn…" |
  | `STEP_ASSIGNED` | `stepKind` (`string \| null`) | "Bạn được giao **bước của** yêu cầu X (…)" |
  | `REQUEST_BUDGET_VERSION_ENDED` | `year`, `costCenterId`, `decision` (đều `\| null`) | "Phiên bản ngân sách **năm của mà** yêu cầu X đang chờ đã kết thúc **()**." |
  | `RETURN_REQUESTED` (nhánh `otherwise`) | `planId` (`\| null`) | "IT Admin sẽ thu hồi quyền của bạn." (đọc được) |

- **Sửa:**
  1. Trong test, thêm bảng `MAY_BE_ABSENT: Record<code, key[]>` chép từ các khóa `(… | null)` của cột `params` trong catalog. Giới hạn là
     các mã có trên nhánh, và chỉ thêm khóa nào xác nhận có `null` ở nơi ghi.
  2. Assert: mỗi khóa trong `MAY_BE_ABSENT[code]` chỉ được xuất hiện trong `[ ]`, hoặc làm `by` của biến thể. Ngoại lệ phải ghi tường
     minh kèm lý do trong một hằng `ABSENT_OUTSIDE_GROUP_OK` (ví dụ `EMPLOYEE_PROFILE_CREATED.departmentId`, vì catalog ghi "thực tế luôn có
     giá trị").
  3. Thêm assert render: với mỗi khóa trong `MAY_BE_ABSENT`, đặt khóa đó `null` trên `baseParams`. Câu ra không được chứa `'()'` và không
     khớp `/\s[.,;:)]/`.
  4. Sửa mẫu câu. Ví dụ vi; en làm tương ứng:
     - `STEP_SLA_ESCALATION`: `…yêu cầu {requestId:name}[ do {holderEmployeeId:name} phụ trách] đã quá hạn…`;
     - `STEP_ASSIGNED`: `Bạn được giao bước[ {stepKind:enum}] của yêu cầu {requestId:name} ({cause:enum}).`;
     - `REQUEST_BUDGET_VERSION_ENDED`: `Phiên bản ngân sách[ năm {year}][ của {costCenterId:name}] mà yêu cầu {requestId:name} đang chờ đã kết thúc[ ({decision})].`
  5. Ghi các chỗ lệch câu chữ so với catalog vào mục Docs follow-up của B-DONE. Catalog README cũng quy ước `[ ]` cho biến có thể vắng.
- **Mutation phải đỏ:** bỏ ngoặc ở `[ Lý do: {reason}.]` của `REQUEST_REJECTED`, hoặc ở `[ của {employeeId:name}]` của `GHOST_SEAT_RETURNED`.

---

## Optional

### O-1 — Cụm chung của REQUEST và chú thích sai về Request nhóm

- **Ở đâu:** `notification-text.types.ts:43`, `request-notification-names.listener.ts:13`, D-N7.
- **Vấn đề với cụm chung:** `NAME_FALLBACK.REQUEST` = "một yêu cầu" / "a request" cho ra "Yêu cầu **một yêu cầu** đã được gửi…" /
  "Your request **a request** was sent…". Test `notification-text.table.spec.ts:236` khóa đúng câu này. Catalog README chọn "yêu cầu
  của bạn".
- **Vấn đề với chú thích:** Request nhóm **có** `planId` (`group-request-writer.service.ts:55,91`). Vì vậy chú thích ở listener
  `:13` và câu D-N7 "Request nhóm thiếu cả hai" đều sai, và cụm chung chỉ hiện khi id đã bị xóa.
- **Sửa:**
  - sửa chú thích và D-N7;
  - hỏi Owner chọn cụm. Gợi ý vi `'(không rõ tên)'`, en `'(unnamed)'`: ít vấp hơn "một yêu cầu" trong mọi câu "Yêu cầu {requestId:name}…";
  - cập nhật test `:236`.

### O-2 — `REQUEST_RETURNED`: câu riêng cho trưởng phòng (`by = SPEND`) chưa có

- **Ở đâu:** `notification-texts-mf1.types.ts:59`.
- **Kịch bản:** trưởng phòng nhận "Vui lòng bổ sung rồi gửi lại.", là lời dặn dành cho người yêu cầu.
- **Vì sao để Optional:** phân biệt cần biết id người yêu cầu, mà `params` không có. Việc thêm params thuộc nhóm P2/4b.
- **Sửa:** ghi D-N mới, dời 4b: thêm `recipientRole` cho mã này ở nơi ghi, như cách đã làm ở N7. Thêm vào Docs follow-up.

### O-3 — `CONTROLLED_WAIT_ALERT` có thể ra `message` rỗng

- **Ở đâu:** `notification-texts-mf1-sla.types.ts:133`.
- **Kịch bản:** catalog cho `waitingReason`, `configurationHint` và (ngữ cảnh 1) `stepKind` nhận `null`. Ba nhóm `[ ]` loại trừ nhau đều
  đòi đủ biến, nên một biến `null` làm `message = ""`. Điều này trái mô tả DTO "Empty only for an unknown code"
  (`inbox.dto.ts`, `message.describe`).
- **Sửa:** viết thành một câu:
  `[Bước {stepKind:enum} của yêu cầu {requestId:name}][Phiên bản ngân sách {year} của {costCenterId:name}][Hồ sơ gia hạn thuê bao {subscriptionId:name}] đang chờ[ vì {waitingReason:enum}].[ Cần: {configurationHint:enum}.]`.
  Thêm assert vào A11: `message !== ''` với `baseParams` của mọi mã.

### O-4 — Test A11.1 bỏ sót một số mutation

Các mutation sau không làm test đỏ:

- (a) `{requestId:name}` đổi thành `{requestId}`, làm lộ uuid thô. README catalog: "không lộ id thô".
- (b) Xóa một `case` của biến thể, ví dụ `CONFIRMED` của `REQUEST_SUBMITTED`; câu rơi về `otherwise`.
- (c) Gõ sai key `case` so với giá trị nơi ghi phát, ví dụ `MOVER`.

Sửa:

- (a) Mọi biến có `key ∈ NAME_KIND_BY_KEY` hoặc `/Id$/` phải dùng `:name` (ngoại lệ ghi tường minh).
- (b), (c) Thêm bảng `VARIANT_DOMAINS` trong test (`audience`, `stage`, `reasonKind`, `source`, `eventKind`, `decision`…) chép từ
  catalog. Assert `Object.keys(cases)` ⊆ domain, và mọi giá trị domain có ca riêng trừ các giá trị liệt kê là "dùng `otherwise`".

### O-5 — Chưa có test HTTP bắt N+1

- **Hiện có:** unit `inbox-view.service.spec.ts:79-104` đã chứng minh mỗi kind chỉ hỏi một lần.
- **Thiếu:** chưa có test HTTP đếm số câu SQL.
- **Sửa:** dùng helper `dataStatements` sẵn có trong `in-app-notifications.integration-spec.ts` (ca "many vs few"), seed 3 và 30 thông báo,
  mỗi thông báo một Request khác nhau. Số câu SQL của `GET /notifications` phải bằng nhau.

### O-6 — `c1b682bc` làm đỏ gate `capability-graph` tạm thời (D-N12)

Nếu cần bisect sạch, gộp `c1b682bc` + `8e0e9d3d` trước khi merge `feat/p5`.

### O-7 — Docs follow-up (cho chat điều phối, Phần C)

- câu `STEP_SLA_REMINDER` cho `REQUESTER` (D-N9);
- `BUDGET_ADJUSTMENT_DECIDED` thêm `[ — {costCenterId:name}]` (catalog `{year}{costCenterId:name}` thiếu dấu ngăn);
- các nhánh `otherwise` B tự viết (B-TEXTS 1);
- các mẫu câu đổi theo R-4;
- `subject.type` `UPPER_SNAKE` (breaking giá trị) đã có trong B-DONE.

### O-8 — Tra tên không lọc `organizationId`

- **Ở đâu:** `namesOf` ở `cost-center.repo.ts`, `department.repo.ts`, `employee-directory.repo.ts`, `application.repo.ts`, `plan.repo.ts`,
  `my-requests.repo.ts` `softwareOf`.
- **Đánh giá:** id lấy từ `params` do BE ghi cho chính tổ chức, và bản cài là một tổ chức, nên chưa có rủi ro thật.
- **Đề xuất:** nếu sau này multi-tenant thì thêm `organizationId` vào `NotificationNameSource.names`. Hiện chỉ ghi FYI.

---

## Nit

- **N-1** `inbox-notification-text.policy.ts:244`: `replace(/ {2,}/g, ' ')` cũng gộp khoảng trắng trong chữ người dùng gõ (`reason`,
  `alternativeNote`). Có thể chấp nhận; nếu muốn chuẩn thì chỉ gộp khoảng trắng ở chỗ biến rỗng.
- **N-2** `request-notification-names.listener.ts:40` tự viết lại định dạng `${applicationName} – ${planName}`, trùng
  `applicationPlanName` của catalog. Nên đưa tên đã định dạng vào `PlanSummary`, hoặc mở một hàm qua `CatalogApi`, để giữ một định dạng duy nhất.
- **N-3** `src/modules/notifications/README.md:41` ghi "(làm ở N5b; …)", nghe như việc chưa làm. README cũng chưa nhắc `InboxViewService`
  hay nhóm `inbox/notification-text/` (cổng vào `inbox-notification-text.policy.ts`).
- **N-4** Tên đăng ký `catalog.names`, `requests.names`, `organization.employee-names` khác mẫu `'<module>.<capability>'` của spec A5.
  Gate không kiểm điều này; chỉ cần thống nhất.
- **N-5** `inbox-view.service.ts:2` import kiểu `RequestLocaleValue` từ `infrastructure/http`. Service nên dùng `NotificationLocale` của
  nhóm text, vì hai kiểu giống nhau. Controller vẫn dùng decorator.

---

## Theo 5 trục — điều đã kiểm và đạt

1. **Spec và quyết định.**
   - Contract chỉ thêm `title`/`message`/`target` (DTO strict, `openapi.json` +3 field + header ở đúng 2 route). Sáu field cũ giữ nguyên;
     integration ca 'keeps the six old fields' kiểm `Object.keys`.
   - Thay đổi giá trị: `subject.type` (A2/A6 cho phép) và ghost seat `employeeId` `"" → null` (A8 #15).
   - `Accept-Language`:
     - đủ 6 ví dụ A3 (`request-locale.decorator.spec.ts:7-12`);
     - `q` sai hoặc `q=0` thì bỏ mục; header dài hơn 256 ký tự thì `vi`;
     - decorator trả hằng đóng;
     - chỉ 2 route dùng.
2. **Đúng đắn.**
   - Renderer không ném:
     - `params` đã qua codec zod lúc đọc;
     - `rawOf` bỏ object/NaN; date sai dạng thì in thô; `BigInt` chỉ chạy sau khi regex khớp;
     - mã lạ cho "Thông báo mới"; `'constructor'` an toàn nhờ `Object.hasOwn`.
   - `title` không bao giờ rỗng: mọi tiêu đề đều có chữ cố định, nên `z.string().min(1)` trong serializer không gây 500.
   - Nguồn tên lỗi thì log một dòng rồi dùng cụm chung. Id không phải uuid được lọc bằng `distinctUuids` trước `IN (…)`.
   - Theo lô: mỗi kind một lời gọi cho cả trang (`Promise.all`); REQUEST dùng 2 truy vấn (Request + `getPlanSummaries`). Phân trang giữ nguyên.
   - Hàng cũ:
     - `subject.type` cũ được chuẩn hóa lúc đọc (`canonicalSubjectType`); integration chèn trực tiếp `'LicenseAssignment'` để kiểm;
     - `STEP_SLA_REMINDER` thiếu `recipientRole` dùng câu người giữ bước;
     - ghost seat `""` làm nhóm `[ ]` ẩn.
3. **Kiến trúc.**
   - `NotificationNameContributions` có `@Injectable`, được provide và export ở `NotificationsModule`, đã có trong
     `PUBLIC_CONTRACT_EXPORTS` (R10). Mỗi listener có `binds` và `add` ở `onModuleInit`.
   - Listener organization khai ở `organization-http.module.ts`, nên graph cài đặt không có `NotificationsModule`. Gates 337/337 và
     depcruise xanh trên CI.
   - `InboxViewService` chỉ ở `notifications-http.module.ts`.
   - Không module nào query bảng của module khác: requests đi qua `CatalogApi`; catalog và organization đọc bảng của chính mình. Listener
     catalog đặt ở `requestable-software`, không phải capability chủ bảng (spec A5). Có thể chấp nhận vì cạnh tới `catalog-entry`, `plan`,
     `subscription` đã có sẵn ở `94a8ee84`.
   - Tên `inbox-notification-text.policy.ts` đúng `docs/rules/module-structure.md:58` (`<capability>-<group>.policy.ts`) và rule
     depcruise `group-entry-from-capability`. D-N13 đúng.
3b. **Phân quyền.**
   - Không thấy lộ dữ liệu. Tên chỉ tra cho id có sẵn trong `params` mà luật nghiệp vụ đã chọn gửi cho đúng người nhận đó.
   - Mỗi nguồn chỉ trả tên hiển thị:
     - EMPLOYEE: `fullName`;
     - DEPARTMENT: `name`;
     - COST_CENTER: `code · name`;
     - APPLICATION/PLAN/SUBSCRIPTION: tên ứng dụng và gói;
     - REQUEST: tên ứng dụng và gói, hoặc tên đề xuất.
   - Không có giá, bằng chứng usage hay hợp đồng, nên không đụng SoD-2. `params` vẫn không chứa tên.
   - `target` chỉ dùng id đã có trong `subject`/`params`. Route đích vẫn tự kiểm quyền.
4. **Test.**
   - Không thấy assertion bị nới. Các test cũ đổi đều có lý do: `'LicenseAssignment' → 'LICENSE_ASSIGNMENT'`, thêm đối số `role`,
     thêm `recipientRole`.
   - A11.1 bắt được: thiếu mã, mã thừa, mã trùng giữa các file, biến lạ, formatter lạ, `:name` không có kind, nhãn thiếu vi/en,
     vi ≠ en, cú pháp ngoặc.
   - A11.1 không bắt được: R-2, R-4, O-4.
   - CI: đỏ ở `quality` (R-1); `integration (2)/(3)` chưa có kết quả lúc review.
5. **D-N1…D-N13.**

| D-N | Đánh giá |
| --- | --- |
| D-N1 | Hợp lý, khớp A3. Thiết kế, không cần làm gì. |
| D-N2 | Số 0 trong `[ ]` coi là vắng. Lệch chữ của A4 (`[ ]` chỉ ẩn khi null/vắng/rỗng), nhưng khớp ghi chú catalog "chỉ hiện khi `overdueWorkingDays` > 0". Không có nhóm `[ ]` nào mà số 0 có nghĩa (đã liệt kê toàn bảng). Optional: Owner duyệt. |
| D-N3 | Đúng A8 #17. |
| D-N4 | Không ảnh hưởng: catalog không dùng `{returnRequestId:name}`, mẫu `RETURN_*` không in id này. Có thể đóng. |
| D-N5 | Đúng catalog. `STEP_ASSIGNED` chưa tách màn theo `stepKind` (dời 4b): Optional. |
| D-N6 | Đúng catalog (catalog thắng A7). |
| D-N7 | **Sai phần "Request nhóm thiếu cả hai"**: nhóm có `planId`. Xem O-1. |
| D-N8 | Đúng, không đổi hành vi mặc định. |
| D-N9 | Spec A8 #3 yêu cầu biến thể; câu tự viết, cần ghi Docs (O-7). |
| D-N10 | Hợp lý (CHECK DB). Unit đã đủ. |
| D-N11 | Đúng A6 (5B-2). |
| D-N12 | Xem O-6. |
| D-N13 | Đúng rule. N3d phải import tên mới. |

Thiếu so với QĐ/spec, không có trong D-N: R-3 (câu theo người nhận), R-4 (A10). Hai mục này đã tính là Required ở trên.
