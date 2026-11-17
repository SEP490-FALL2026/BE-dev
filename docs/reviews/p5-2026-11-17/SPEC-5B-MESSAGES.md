# SPEC 5b — Thông báo có chữ và lỗi cụ thể (prompt 5, chat **B** Sonnet)

> **Sửa 17/11 theo `REVIEW-SPECS.md` + `PLAN.md`** (review viết trên bản cũ 13,2 giờ; nhận xét giờ/E-task cũ bỏ qua vì phần lỗi đã thu gọn còn
> ~2,5 giờ). Một chat **B**, nhánh `feat/p5-b-messages` từ `dev`: **Phase N chạy ngay** (song song A1/A2/C); mẫu câu cho mã mới/đổi của A1/A2
> (N3d) và **Phase E chạy sau khi A2 (rồi A1) merge vào `feat/p5`** — rebase lên `feat/p5`. B merge cuối. Áp: 5B-1 (wiring extension point),
> 5B-2 (không ném `SUBJECT_INVALID` trong transaction nghiệp vụ), 5B-3 (D4 phủ mã đổi params, A8 #19), 5B-4 (breaking), 5B-5 (file nhóm cho
> mã mới), 5B-7 (D3), 5 trích dẫn lệch dòng.
>
> **Review 2 (17/11, đọc code `dev` @ `94a8ee84`):** nơi khai listener organization (graph cài đặt cấm `NotificationsModule`), `@Injectable` +
> `binds` + `PUBLIC_CONTRACT_EXPORTS` (R10), hàm đọc tên theo lô chưa có ⟹ tách N5a/N5b, nơi ghi `employeeId ''` (A8 #15, N7), nhãn N3d,
> biến thể là cả câu, spec unit tạo mới, giờ Phase N 7,0 ⟹ 7,6. Các chỗ sửa ghi "Review 2".

Người viết: agent spec 5b, 16/11/2026. BE `dev` @ `94a8ee84` (chỉ đọc khi viết spec). Brief: `SPEC-BRIEF.md` cùng thư mục.

Skill đã đọc/dùng:

- `agent-skills:spec-driven-development` (process): khung spec, điều kiện xong kiểm được, ranh giới.
- `agent-skills:planning-and-task-breakdown` (process): task ≤ ~5 file, thứ tự phụ thuộc, checkpoint.
- `superpowers:writing-plans` (process, phụ): mỗi task có file, test, lệnh kiểm.
- `agent-skills:api-and-interface-design` (domain): chỉ thêm field, lỗi một hình dạng, contract trước code.
- `superpowers:verification-before-completion` (verification): điều kiện xong là lệnh chạy được, không phải lời khẳng định.

Nguồn: `GENERIC-ERRORS.md` (184 dòng), `REPORT-A1…A6.md`, `REVIEW-R1.md`, `REVIEW-R2.md` (đều ở
`docs/reviews/fe-feedback-2026-11-11/audit-p3/apidocs/`), `OVERNIGHT-DECISIONS.md` §2, catalog FE
`D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\catalog\{notifications,errors,README}.md`.

Quyết định Owner áp dụng (16/11, không hỏi lại): thông báo trả `title`/`message` theo `Accept-Language` (vi mặc định, en), **ghép lúc
đọc** từ `code`+`params`, không lưu chữ; giữ `code`/`params`/`subject`, thêm `target`; chỉ API thông báo đọc `Accept-Language`. Lỗi:
`message` giữ tiếng Anh, thêm mã cụ thể + `details` có cấu trúc, FE hiện tiếng Việt theo catalog. Câu thông báo **dùng đúng câu trong
`catalog/notifications.md`** (catalog/README.md "Quyết định của Owner").

Ngoài phạm vi 5b (thuộc 5a, xem `OVERNIGHT-DECISIONS.md` §2 dòng 1–4): lỗi 500 `BUDGET.COMMITMENT_NOT_HOLDABLE`/`COMMITMENT_EXISTS` ở duyệt
chi; thông báo thiếu MF-1 (gửi lại sau Trả về, `STEP_ASSIGNED` qua lô…); thông báo báo lỗi SaaS; SBF-20; `loginEmail = workEmail`; email.

---

## Phần A — Thông báo có chữ

### A1. Hiện trạng

| Chỗ | Hiện tại |
| --- | --- |
| `src/modules/notifications/public/notifications.types.ts:50-211` | `IN_APP_NOTIFICATION_CODES`: 118 mã trên `dev` (đếm bằng script). Sau A1 (+3) và A2 (+8 nếu đủ task, Q-5A-1 = B) ≈ **129**; số thật đọc lại sau rebase — `satisfies` bắt thiếu. |
| `src/modules/notifications/inbox/inbox.policy.ts:29-213` | `PARAM_KEYS_BY_CODE`: khóa params mỗi mã; chỉ id, mã enum, ngày, số đếm; `FIGURE_WORDS` cấm tiền. Không có tên. |
| `src/modules/notifications/inbox/inbox.dto.ts:23-30` | `notificationSchema` (strict): `id, code, subject{type,id}\|null, params, createdAt, readAt`. Không có chữ. |
| `src/modules/notifications/inbox/inbox.controller.ts:28-40` | `wireOf` dựng wire trong controller; route trả thông báo: `notificationList` (`:52-73`), `notificationMarkRead` (`:108-135`). `notificationUnreadCount`, `notificationMarkAllRead` chỉ trả số. Không có route "get one". |
| `src/modules/notifications/inbox/inbox.service.ts:30-57` | `list`, `markRead` trả `InAppNotificationRecord`. |
| `src/modules/notifications/inbox/notification-params.json.ts` | codec cột `params` (phẳng). Không đổi. |
| `subject.type` | Phần lớn `UPPER_SNAKE`; lệch: `LicenseAssignment`, `ProvisioningTask` (`src/modules/licensing/licensing-alerts.policy.ts:41,64,98`, `licensing/provisioning/provisioning-task-frame.service.ts:124`); hàng cũ của mã chỉ đọc còn `HandoverDuty`, `Employee` (catalog). REPORT-A6, GENERIC-ERRORS dòng 249. |
| Catalog FE | `catalog/notifications.md`: 118/118 mã có tiêu đề + nội dung VI/EN, cú pháp biến ở `catalog/README.md` §"Quy ước biến". Biến tên (`{x:name}`) xuất hiện ~300 lần: `requestId` 85, `employeeId`+các khóa nhân viên ~80, `costCenterId` 38, `departmentId`(+from/to) 36, `planId`(+suggested/alternative) 30, `applicationId` 23, `subscriptionId` 18, `policyCode` 3. Không mã nào dùng `:vnd`, `:datetime`, `:mb`. |
| Mã chỉ đọc | Catalog đánh dấu **12** mã (không phải 11): `SERVICE_ACCOUNT_BOUNDARY_ACCEPTED`, `REQUEST_FINANCE_REVIEW_OPENED`, `REQUEST_RETURNED_BY_FINANCE`, `REQUEST_AWAITING_BUDGET`, `REQUEST_BUDGET_VERSION_ENDED`, `FINANCE_QUESTION_REMINDER`, `TRANSFER_REVIEW_DUE`, `BUDGET_DEPARTMENT_CEILING_PUBLISHED`, `HANDOVER_CONFIRMATION_DUE`, `HANDOVER_CONFIRMATION_OVERDUE`, `SERVICE_ACCOUNT_RESPONSIBLE_DUE`, `SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE`. |
| Tầng module | `notifications` là T1 (`ARCHITECTURE.md` bảng tầng): không được import `organization`/`catalog`/`requests`. Muốn tra tên phải mở extension point (`src/core/extension/contributions.ts`). |

### A2. Contract đích (chỉ thêm field)

`notificationList` và `notificationMarkRead` — mỗi phần tử thông báo thêm 3 field, giữ nguyên 6 field cũ:

```json
{
  "id": "uuid", "code": "REQUEST_NEED_APPROVED",
  "subject": { "type": "ACCESS_REQUEST", "id": "uuid" },
  "params": { "requestId": "uuid", "next": "SPEND_SUBMISSION" },
  "title": "Nhu cầu đã được duyệt",
  "message": "Nhu cầu cho yêu cầu Figma – Professional đã được duyệt. Bước tiếp theo: chờ trưởng phòng trình duyệt chi.",
  "target": { "operationId": "accessRequestGet", "pathParams": { "id": "uuid" } },
  "createdAt": "…", "readAt": null
}
```

- `title`: string, luôn có, không rỗng. `message`: string, luôn có (có thể rỗng chỉ với mã lạ). Văn bản thuần, không HTML; giá trị người
  dùng gõ (`reason`, `alternativeNote`) chèn nguyên văn ⟹ FE phải render dạng text.
- `target`: `{ operationId: string; pathParams: Record<string,string> } | null`. `operationId` là route đọc chi tiết FE nên mở (cột "Bấm
  vào mở" của catalog); `null` ⟹ FE mở danh sách thông báo. Web và mobile tự map `operationId` → màn của mình.
- `subject.type`: luôn `UPPER_SNAKE` trên dây (xem A6). Đây là thay đổi giá trị cho 4 kiểu cũ ⟹ ghi vào FE changelog.
- Header vào `Accept-Language` (tùy chọn) chỉ ở 2 route trên; khai `@ApiHeader` trong OpenAPI. Không thêm header ra.
- Mã không có mẫu câu (chỉ xảy ra khi DB còn mã đã bị xóa khỏi bảng): `title` = "Thông báo mới"/"New notification", `message` = "",
  `target` theo `subject` nếu có. Không ném lỗi.

### A3. `Accept-Language` (helper dùng chung)

- File mới `src/infrastructure/http/decorators/request-locale.decorator.ts`: hàm thuần `localeFromAcceptLanguage(header: string | undefined): 'vi' | 'en'`
  và param decorator `@RequestLocale()` (dùng `createParamDecorator`, đọc `request.headers['accept-language']`).
- Luật: tách theo dấu phẩy; mỗi mục `tag;q=x` (q mặc định 1, q không hợp lệ ⟹ bỏ mục, q=0 ⟹ bỏ); sắp q giảm dần, giữ thứ tự gốc khi bằng
  nhau; lấy subtag chính (trước `-`/`_`) chữ thường; mục đầu tiên là `vi` hoặc `en` thắng; `*`, rỗng, không khớp, header > 256 ký tự ⟹ `vi`.
  Ví dụ: `vi-VN` → vi; `en-US,en;q=0.9` → en; `fr, en;q=0.5` → en; `de` → vi; `EN` → en; `en;q=0, vi` → vi.
- Decorator trả hằng đã đóng (`'vi'|'en'`), không trả input thô ⟹ hợp lệ với chú thích `ApplicationZodValidationPipe`
  (`src/infrastructure/http/pipes/zod-validation.pipe.ts:19-24`: custom decorator bỏ qua pipe, không được trả input thô).
- Chỉ `InboxController.list` và `.markRead` dùng. Không interceptor toàn cục (Owner: chỉ API thông báo).

### A4. Catalog mẫu câu (TypeScript, theo mã)

Thư mục nhóm mới `src/modules/notifications/inbox/notification-text/` (cổng vào duy nhất `notification-text.policy.ts`, phần còn lại riêng tư;
không barrel — luật nhóm ở `docs/rules/module-structure.md`):

| File | Nội dung |
| --- | --- |
| `notification-text.types.ts` | `NotificationLocale = 'vi' \| 'en'`; `NotificationTexts`; `NAME_KIND_BY_KEY`; `NAME_FALLBACK` (cụm chung theo kind × locale). `NameKind` **import** từ `public/notifications.extension-points.ts` (một định nghĩa duy nhất, A5) — Review 2. |
| `notification-texts-mf1.types.ts` | MF-1 + hạn bước/hàng đợi (41 mã). |
| `notification-texts-org.types.ts` | MF-2, MF-3, tổ chức/nhân sự/bàn giao IT, chính sách (21 mã). |
| `notification-texts-budget.types.ts` | MF-4 + SBF-11 (26 mã). |
| `notification-texts-licensing.types.ts` | MF-5, SBF-03, SBF-20, SBF-19, danh sách phần mềm phòng (30 mã + 3 mã mới của A1). |
| `notification-texts-ops.types.ts` (mới, review 5B-5) | Mã mới của A2: báo lỗi SaaS (3), `OUT_OF_PROCESS_CASE_REPORTED`, `VENDOR_ACCOUNT_DISCREPANCY_OPENED`, `DEVICE_STOP_*` (2), `SPEND_BATCH_SUBMITTED`. Mỗi file ≤ 500 dòng; vượt thì tách tiếp theo nhóm. |
| `notification-labels.types.ts` | Nhãn enum vi/en: `SHARED_LABELS[key][value]` và `CODE_LABELS[code][key][value]` (ưu tiên theo mã). |
| `notification-text.policy.ts` | `NOTIFICATION_TEXTS` gộp **5** file nhóm (Review 2: thêm `-ops`) `satisfies Record<InAppNotificationCode, NotificationTexts>` (thiếu mã ⟹ lỗi typecheck; mã không còn trong `IN_APP_NOTIFICATION_CODES`, ví dụ task A2 bị cắt ⟹ cũng lỗi, nên chỉ viết mẫu cho mã có thật trên nhánh); `renderNotificationText(code, params, locale, names)`; `nameRefsOf(code, params)` (các cặp kind/id cần tra). Gộp bằng spread nên mã trùng giữa hai file bị ghi đè im lặng ⟹ test A11.1 kiểm **không mã nào có ở hai file** (Review 2). |
| `notification-text.policy.spec.ts` | Test duyệt toàn bộ bảng (A11). |

(Mỗi file ≤ 500 dòng — `max-lines` của ESLint; chia nhóm theo mục lục catalog.)

Hình dạng một mục (mẫu code):

```ts
// notification-texts-mf1.types.ts
export const MF1_TEXTS = {
  REQUEST_NEED_APPROVED: {
    vi: { title: 'Nhu cầu đã được duyệt', message: 'Nhu cầu cho yêu cầu {requestId:name} đã được duyệt. Bước tiếp theo: {next:enum}.' },
    en: { title: 'Need approved', message: 'The need for your request {requestId:name} was approved. Next step: {next:enum}.' },
  },
  REQUEST_REJECTED: {
    vi: { title: 'Yêu cầu bị từ chối', message: 'Yêu cầu {requestId:name} bị từ chối ở bước {by:enum}.[ Lý do: {reason}.][ Gói tương đương trong danh mục: {suggestedPlanId:name}.]' },
    en: { title: 'Request rejected', message: 'Your request {requestId:name} was rejected at the {by:enum} step.[ Reason: {reason}.][ A similar plan in the catalogue: {suggestedPlanId:name}.]' },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;

// notification-texts-org.types.ts — câu theo audience
DEPARTURE_ACCESS_BLOCKED: {
  vi: { title: 'Truy cập của người nghỉ việc đã bị chặn',
        message: { by: 'audience', cases: { SUPER_ADMIN: '…', IT_ADMIN: '…' }, otherwise: '{employeeId:name} bị từ chối truy cập từ {blockedOn:date}.' } },
  en: { … },
},
```

```ts
// notification-text.types.ts
export type TextTemplate = string | { by: string; cases: Readonly<Record<string, string>>; otherwise: string };
export interface LocaleTexts { title: TextTemplate; message: TextTemplate }
export interface NotificationTexts { vi: LocaleTexts; en: LocaleTexts }
```

Ngôn ngữ mẫu = đúng cú pháp catalog/README.md để chép thẳng từ catalog:

| Cú pháp | Render |
| --- | --- |
| `{key}` | giá trị thô (`String(v)`); `null`/vắng ⟹ chuỗi rỗng (chỉ dùng trong `[ ]` nếu có thể vắng). |
| `{key:name}` | tên từ bộ tra (A5); không tra được ⟹ `NAME_FALLBACK[kind][locale]`. |
| `{key:date}` | `YYYY-MM-DD` → vi `dd/MM/yyyy`, en `dd MMM yyyy` (bảng tháng cố định, không dùng `Intl`); sai dạng ⟹ giá trị thô. |
| `{key:enum}` | nhãn `CODE_LABELS[code][key][v] ?? SHARED_LABELS[key][v]`; không có nhãn ⟹ giá trị thô. |
| `{key:list}` | tách chuỗi theo `,` (bỏ khoảng trắng), dịch từng phần tử như `:enum`, nối `, `. |
| `{key:quarter}` | (mới, cho `BUDGET_REVIEW_EXPLANATION_*`) `month` → `Q{ceil(month/3)}`/`quý {n}`. |
| `{key:vnd}` | chuỗi số nguyên → vi `29.000.000 ₫`, en `29,000,000 VND`. Hiện không mã nào dùng (params cấm tiền), cài sẵn vì Owner hỏi định dạng tiền; có test riêng. |
| `[ … ]` | chỉ hiện khi **mọi** biến bên trong khác `null`/vắng/chuỗi rỗng. Không lồng. |
| biến thể | `{ by: key, cases, otherwise }`: chọn `cases[String(params[by])]`, không có ⟹ `otherwise`. Dùng cho `audience`, `stage`, `kind`, `recipientRole`, `requiresReacknowledgement`… như catalog ghi "câu theo X". Biến thể là **cả câu** (không nối đuôi): bảng bàn giao A1/A2 ghi "câu gốc + biến thể `by: trigger`/`by: substitute` thêm đuôi" ⟹ viết mỗi `case` = câu gốc + đuôi, `otherwise` = câu gốc (Review 2). Boolean so bằng chuỗi `'true'`/`'false'`. |

Nguồn câu: chép **nguyên văn** cột "Tiếng Việt"/"English" và bảng nhãn ở cột "Ghi chú" của `catalog/notifications.md`. Chỗ catalog viết
`{requestId}` thô trong câu cho người dùng (1 chỗ) hay `{key:name}` với `policyCode` ⟹ `policyCode` hiện thô (là mã chính sách, ví dụ
`POL-USAGE`; không thêm bộ tra kind POLICY). Câu chép sai/thiếu so với catalog là lỗi review.

### A5. Tên trong câu (tra lúc đọc)

- Extension point mới `src/modules/notifications/public/notifications.extension-points.ts`:

```ts
export type NameKind = 'REQUEST' | 'EMPLOYEE' | 'DEPARTMENT' | 'COST_CENTER' | 'APPLICATION' | 'PLAN' | 'SUBSCRIPTION';
export interface NotificationNameSource {
  readonly kinds: readonly NameKind[];
  /** Display names of the ids that exist; a missing id is simply absent. Never throws for an unknown id. */
  names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
@Injectable() // Review 2: bắt buộc như DepartmentUseContributions (organization.extension-points.ts:53-58), không có thì DI không tạo được
export class NotificationNameContributions extends Contributions<NotificationNameSource> {
  constructor() { super('notifications.name-sources'); } // tên duy nhất (test/http/platform/extension-points.http-spec.ts)
}
```

- `NAME_KIND_BY_KEY`: `requestId`→REQUEST; `employeeId`, `holderEmployeeId`, `beneficiaryEmployeeId`, `fromEmployeeId`,
  `changedByEmployeeId`→EMPLOYEE; `departmentId`, `fromDepartmentId`, `toDepartmentId`, `owningDepartmentId`→DEPARTMENT;
  `costCenterId`→COST_CENTER; `applicationId`→APPLICATION; `planId`, `suggestedPlanId`, `alternativePlanId`→PLAN; `subscriptionId`→SUBSCRIPTION.
- Bên đăng ký (listener trong `onModuleInit`, đúng mẫu các `*.listener.ts` hiện có):
  - `organization`: EMPLOYEE (họ tên hiển thị), DEPARTMENT (tên phòng), COST_CENTER (mã + tên).
  - `catalog`: APPLICATION (tên ứng dụng), PLAN (`<Ứng dụng> – <Gói>`), SUBSCRIPTION (`<Ứng dụng> – <Gói>`).
  - `requests`: REQUEST (`<Ứng dụng> – <Gói>` của Request; đề xuất phần mềm mới chưa có gói ⟹ tên ứng dụng đề xuất).
  Mỗi bên một truy vấn `IN (…)` mỗi kind; không tạo vòng capability (R6). **Review 2:** trên `dev` **chưa có** hàm đọc tên theo lô
  cho EMPLOYEE/DEPARTMENT/COST_CENTER/APPLICATION/PLAN/REQUEST (chỉ có `catalog/subscription/subscription.repo.ts:503 labelsOf` cho
  SUBSCRIPTION và `requests/my-requests/my-requests.repo.ts:112 proposalNames` cho đề xuất) ⟹ mỗi kind còn lại thêm **một hàm repo mới**
  ở capability sở hữu bảng (`namesOf(ids, tx?)` → `Map<id, tên>`), đặt listener trong đúng capability đó (ví dụ
  `organization/employee/employee-notification-names.listener.ts` cho EMPLOYEE) để không tạo cạnh capability mới.
  - Mỗi lớp listener khai `static readonly binds = [NotificationNameContributions] as const;` và `add('<module>.<capability>', this)`
    trong `onModuleInit` (gate `extension-wiring` test 1–2 đối chiếu `binds` với `onModuleInit`, `docs/rules/module-structure.md` §Extension point).
- `InboxViewService` (mới, `inbox/inbox-view.service.ts`, "ghép nhiều nguồn trước mapper"): với một trang (≤ 50 thông báo) gom id theo kind
  **chỉ của các biến `:name` mà mẫu câu của locale đó dùng**, gọi mỗi kind một lần, rồi render. Kind không có bên đăng ký hoặc bên đăng ký
  lỗi ⟹ log một dòng (`describeForOperator`) và dùng cụm chung; không để route thất bại vì tên.
- Phân quyền: tên chỉ hiện cho người nhận của thông báo — người mà luật nghiệp vụ đã chọn để báo về đúng đối tượng đó; chỉ trả tên hiển
  thị, không trả trường khác. `params` vẫn không chứa tên (`inbox.policy.ts` giữ nguyên).
- **Wiring (review 5B-1)** theo mẫu `DepartmentUseContributions` (`organization/organization.module.ts:24,43`): **provide + export**
  `NotificationNameContributions` ở `NotificationsModule` (`notifications/notifications.module.ts:32-57`), để listener của `organization`/
  `catalog`/`requests` resolve được ở **mọi** graph (API, worker, CLI) — đặt provider ở module chỉ graph API dùng sẽ làm listener lỗi DI khi
  boot worker/CLI. **Người dùng** point (`InboxViewService`) chỉ đặt ở `notifications/notifications-http.module.ts` (graph API). Khi đó gate
  `extension-wiring` (`test/gates/extension-wiring.gate-spec.ts`) không cần ngoại lệ (gate chỉ đòi đủ bên đăng ký ở graph **có người dùng**
  point — chỉ API); chat B chạy gate để xác nhận.
- **Nơi khai listener (Review 2, kiểm bằng code):**
  - `organization`: listener khai ở **`organization/organization-http.module.ts`** (đã import `NotificationsModule`; tiền lệ
    `HeldNoticeHandoverListener`), **không** ở `organization.module.ts`. Lý do: `InstallationModule` import `OrganizationModule`
    (`installation/installation.module.ts:19`) và gate `module-graph` cấm `NotificationsModule` trong graph cài đặt
    (`test/gates/module-graph.gate-spec.ts:451-459`); thêm `NotificationsModule` vào `OrganizationModule` sẽ đỏ gate.
  - `catalog`: `catalog.module.ts` (đã import `NotificationsModule`). `requests`: `requests.module.ts` (đã import). Không khai cùng lớp
    listener ở hai Nest module của một graph (`Contributions.add` ném khi trùng tên).
  - R10: thêm `'NotificationsModule: NotificationNameContributions'` vào `PUBLIC_CONTRACT_EXPORTS` của `test/gates/module-graph.gate-spec.ts`
    (như `'OrganizationModule: DepartmentUseContributions'` `:191`); thiếu thì gate R10 đỏ vì listener ngoài thư mục `notifications` inject token này.
  - Module card: `notifications/README.md` §"Extension point" (hiện "Mở: không có") ghi điểm mới + 3 bên đăng ký; README của
    `organization`, `catalog`, `requests` ghi "Đăng ký vào" (`docs/rules/module-structure.md` §Extension point, dòng cuối).

### A6. `target` và `subject.type`

- `inbox/notification-target.policy.ts` (mới, thuần): `notificationTarget(code, subject, params): Target | null`.
  - `TARGET_BY_CODE` (ưu tiên): mục `{ operationId, pathParams: { <tên tham số path>: 'subject' | '<paramKey>' }, by?: 'audience' }` cho mã
    có màn riêng theo catalog "Bấm vào mở" (ví dụ `DEPARTURE_ACCESS_BLOCKED` → `offboardingCaseGet`, `RETURN_*` → route của Request trả quyền).
  - `TARGET_BY_SUBJECT_TYPE` (dự phòng): `ACCESS_REQUEST`→`accessRequestGet`, `OFFBOARDING_CASE`→`offboardingCaseGet`, … một dòng cho mỗi
    kiểu `subject` trong catalog.
  - Thiếu giá trị cho một path param ⟹ thử bảng dự phòng ⟹ `null`.
- `canonicalSubjectType(type)`: bí danh `LicenseAssignment`→`LICENSE_ASSIGNMENT`, `ProvisioningTask`→`PROVISIONING_TASK`,
  `HandoverDuty`→`HANDOVER_DUTY`, `Employee`→`EMPLOYEE`; giá trị khác giữ nguyên. Áp lúc đọc cho cả hàng cũ (không migration, không backfill).
- Sửa nơi ghi: `licensing-alerts.policy.ts:41,64,98`, `provisioning-task-frame.service.ts:124` ghi `UPPER_SNAKE`.
- **Không thêm luật từ chối** vào `refuseInAppNotification` (`inbox.policy.ts:225`) (review 5B-2): `deliver`/`hold` ném
  `InvalidInAppNotificationError` ngay trong transaction nghiệp vụ (`inbox.service.ts:24-25`, `held-notification.service.ts:27-28`), nên sót
  một nơi ghi — hoặc hàng giữ cũ lúc `deliverToHead` bàn giao — sẽ làm thao tác nghiệp vụ/đổi trưởng phòng trả 500. Thay vào đó, ở đường ghi
  (`InboxService.deliver`, `HeldNotificationService.hold`) **chuẩn hóa** `subject.type = canonicalSubjectType(type)` trước khi lưu; giá trị
  vẫn không `UPPER_SNAKE` sau chuẩn hóa ⟹ `logger.warn` (code, eventKey, type) rồi vẫn lưu. Chặn tái phát bằng test: spec quét `src/**`
  tìm literal `subject: { type: '…'` không `UPPER_SNAKE` (hoặc gate nhỏ cùng ý), đỏ khi có.

### A7. Mã chỉ đọc

12 mã ở A1 vẫn có mục trong `NOTIFICATION_TEXTS` (câu của catalog), `target` theo catalog (đa số `null` vì route cũ đã xóa). Không ghi
mới (nơi phát đã gỡ). Test A11 bao cả 12.

### A8. Params còn thiếu (23 dòng của GENERIC-ERRORS §Thông báo)

Nguyên tắc: **chỉ thông báo ghi mới có params mới; không backfill** (params là ảnh chụp lúc phát; dựng lại từ audit tốn và rủi ro; migration
forward-only). Mẫu câu phải đúng khi khóa mới vắng (dùng `[ ]` hoặc `otherwise`).

| # | Dòng | Xử lý | Ở đâu |
| --- | --- | --- | --- |
| 1 | `REQUEST_*`/`STEP_*` thiếu `applicationId` | Không cần: `{requestId:name}` do BE tra | — |
| 2 | Dòng của Request nhóm thiếu `beneficiaryEmployeeId` | P2 | 4b |
| 3 | `STEP_SLA_REMINDER` thiếu `recipientRole` | **P1**: thêm khóa `recipientRole` (`HOLDER`\|`REQUESTER`) vào `PARAM_KEYS_BY_CODE`, ghi ở `requests/sla/step-sla.policy.ts:183-214` (đã có `role`); mẫu câu biến thể, `otherwise` = câu người giữ bước | 5b N7 |
| 4 | `REQUEST_CANCELLED`/`GRANT_TASK_CANCELLED` thiếu `cause` | P2 (câu chung "đã được đóng/hủy" vẫn đúng) | 4b |
| 5 | `CONTROLLED_WAIT_ALERT` thiếu `kind` | Không cần: mẫu câu dùng `[ ]` theo khóa có giá trị (`requestId`/`versionId`/`renewalId`) | — |
| 6 | `PURCHASE_INVOICE_RETURNED` thiếu `reason` | P2 | 4b |
| 7 | Khóa luôn `false`/`null` (`handoverRequired`, `handoverDueOn`, `handoverFlagged`, `suggestedPlanId` ở nhóm) | Mẫu câu không in; dọn khóa params chết = P2. ("Dọn tham số chết" của A2 là **tham số vận hành** ZBB, không phải khóa params thông báo — review 5B-7.) | 4b |
| 8 | `BUDGET_PROPOSAL_TASK_ASSIGNED` thiếu `proposalId` | P2; `target` dùng route ngân sách của tôi | 4b |
| 9 | `BUDGET_COST_CENTER_SETUP_DUE`, `BUDGET_NO_HEAD_AT_DEADLINE` thiếu `costCenterId` | Không cần: câu dùng `{departmentId:name}` | — |
| 10 | `BUDGET_VERSION_*` thiếu `departmentId` | Không cần: `{costCenterId:name}` | — |
| 11 | `decision` lệch `APPROVED`/`APPROVE` | Không cần: bảng nhãn theo mã nhận cả hai; thống nhất enum = P2 | 4b |
| 12 | `BUDGET_ADJUSTMENT_*` Cost Center bên cho/nhận | P2 | 4b |
| 13 | `BUDGET_REVIEW_EXPLANATION_*` thiếu chữ "quý" | Không cần: formatter `:quarter` | 5b N2 |
| 14 | `GHOST_SEAT_NEW`/`ACTION_TIER` thiếu `newCount` | P2 | 4b |
| 15 | `GHOST_SEAT_RETURNED` thiếu `reason`; `employeeId = ""` | `""` → `null`: **P1**. **Review 2 (sửa nơi ghi):** `GHOST_SEAT_RETURNED` ghi ở `optimization/decision/decision-return.service.ts:124`; cùng lỗi `employeeId: record.employeeId ?? ''` còn ở `decision-reminder.service.ts:64` (`GHOST_SEAT_DECISION_OVERDUE`) và `:132` (`GHOST_SEAT_EXEMPTION_ENDING`) ⟹ sửa cả 3 chỗ; `decision-routing.service.ts` không có `?? ''`. Mẫu câu 3 mã đặt `{employeeId:name}` trong `[ ]` hoặc biến thể. `reason` P2 | 5b N7 / 4b |
| 16 | `VENDOR_ADMINS_BELOW_MINIMUM.adminCount` luôn 0 | Mẫu câu không in số; sửa số = P2 | 4b |
| 17 | `USAGE_TRACKING_NOTICE.dataKinds`/`purpose` là câu tiếng Việt | Câu en bỏ hai cụm này; đổi sang enum = P2 | 4b |
| 18 | `REVOCATION_OVERDUE` thiếu `departmentId` | P2 | 4b |
| 19 | `SUBSCRIPTION_RENEWAL_ALERT` thiếu `daysLeft` | **A1 đổi params** (review 5B-3, `SPEC-5A-SBF20.md` §13): dòng mới có `baseDate, renewalOn, seatsNeeded, commitment`, không còn `milestoneDays`; khóa cũ giữ trong `PARAM_KEYS_BY_CODE`. N3d viết lại mẫu câu theo §13: biến thể `by: commitment` cho dòng mới, `otherwise` cho dòng cũ, khóa cũ trong `[ ]`. Không cần `daysLeft` | 5b N3d |
| 20 | `LICENSE_EXPIRY_REMINDER`, `RENEWAL_WINDOW_OPENED`, `SUBSCRIPTION_SEATS_INCREASED` thiếu ứng dụng | Không cần: `{planId:name}`/`{subscriptionId:name}` gồm tên ứng dụng | — |
| 21 | `IT_ADMIN_HANDOVER_PENDING` thiếu số lượng | P2 | 4b |
| 22 | `subject.type` hoa/thường | **P1** (A6) | 5b N5 |
| 23 | `accessRequestResubmit` không tạo thông báo | Việc của 5a (dòng 3 "Cao") | 5a |

### A9. Email

Không dùng chung catalog trong 5b. 3 mẫu email hiện có (`notifications/email/email-templates.mapper.ts`) là thư xác thực có link, khác hình
dạng. `renderNotificationText` là hàm thuần trong cùng module nên email (cùng module `notifications`) gọi lại được nếu sau này gửi bản email
của thông báo trong ứng dụng; khi đó chỉ thêm locale của người nhận.

### A10. Ca biên

`params` thiếu khóa mẫu câu cần (hàng cũ) ⟹ `[ ]` ẩn, biến ngoài `[ ]` ra chuỗi rỗng (test A11 ép mẫu đặt biến có thể vắng trong `[ ]`
hoặc biến thể). Id đã xóa ⟹ cụm chung. Enum giá trị lạ ⟹ thô. `Accept-Language` lạ ⟹ vi. Trang rỗng ⟹ không gọi bộ tra. Mã lạ ⟹ A2.
Người nhận không phải chủ thể (Super Admin, IT) ⟹ dùng đúng câu theo `audience` của catalog.

### A11. Điều kiện xong (kiểm được)

1. `notification-text.policy.spec.ts` duyệt **toàn bộ** `IN_APP_NOTIFICATION_CODES` (không liệt kê tay), mỗi mã:
   - có `vi` và `en`, `title` không rỗng (cả mọi nhánh biến thể);
   - phân tích mọi mẫu (title, message, mọi `cases`, `otherwise`): mỗi `{key…}` có `key ∈ PARAM_KEYS_BY_CODE[code]`; formatter thuộc
     `{'' , name, date, enum, list, quarter, vnd}`; `:name` ⟹ `key ∈ NAME_KIND_BY_KEY`; `:enum`/`:list` ⟹ có bảng nhãn cho `key`
     (theo mã hoặc chung) ở **cả** vi và en với cùng tập giá trị; `by` của biến thể ∈ khóa của mã; ngoặc `[ ]` cân, không lồng;
   - tập biến dùng ở vi = tập biến dùng ở en;
   - render với params rỗng `{}` và với params mẫu (mỗi khóa: id `'00000000-…'`, ngày `'2026-01-02'`, số `1`, chuỗi `'X'`, mọi giá trị
     `cases`), cả hai locale, names rỗng: kết quả không chứa `{`, `}`, `[`, `]`, `undefined`, `null`, `NaN`, `[object`.
2. Spec của `localeFromAcceptLanguage` (các ví dụ A3), formatter (`date`, `vnd`, `quarter`, `list`), `canonicalSubjectType`,
   `notificationTarget`; spec target đọc `openapi.json` ở gốc repo: mọi `operationId` trong hai bảng target tồn tại, là `GET`, và mọi tham số
   path của nó có trong `pathParams`.
3. `inbox.service.spec.ts`/`held-notification.service.spec.ts` (**tạo mới** — trên `dev` chưa có, Review 2): `subject.type = 'LicenseAssignment'` ⟹ lưu `LICENSE_ASSIGNMENT`, không ném; giá trị lạ
   ⟹ lưu + `warn`, không ném. Spec quét literal `subject: { type:` ⟹ không còn giá trị không `UPPER_SNAKE`. `inbox.policy.spec.ts`:
   `STEP_SLA_REMINDER` nhận `recipientRole`.
4. Integration (`test/integration/notifications/in-app-notifications.integration-spec.ts` hoặc file mới cạnh nó): list có `Accept-Language: en`
   ⟹ câu en; không header ⟹ vi; tên thật của Request/nhân viên xuất hiện trong `message`; id không tồn tại ⟹ cụm chung; hàng cũ
   `LicenseAssignment` ⟹ `subject.type = LICENSE_ASSIGNMENT`; 6 field cũ giữ nguyên giá trị.
5. `pnpm openapi:export` cập nhật `openapi.json`: 2 route có header `Accept-Language`, schema thêm `title`, `message`, `target`; mô tả route
   bỏ câu "the client turns them into words".

---

## Phần B — Lỗi (thu gọn theo Owner 17/11)

### B0. Nguyên tắc

Owner chốt 17/11, theo thông lệ API lớn (Stripe, GitHub, Google AIP-193, RFC 9457):

- Lỗi nhập liệu: danh sách field và mã ngắn. Không trả min/max/enum; FE lấy giới hạn từ OpenAPI.
- Lỗi nghiệp vụ: một mã cho mỗi luật, kèm metadata tối thiểu mà client cần để hành động.
- `error.message` giữ tiếng Anh; FE không dựa vào nó.
- Prompt 5 **không đổi HTTP status, không đổi tên mã, không xóa mã**. Chỉ làm bốn việc: thêm `details` (tương thích), khai OpenAPI cho mã
  code đã ném, sửa mô tả OpenAPI trái code, và `details.path` cho lỗi tiền.
- Mã đụng tới thì sửa ví dụ OpenAPI (`*_ERROR_EXAMPLES`) cùng lúc.

### B1. `VALIDATION_ERROR` — giữ nguyên

`details.issues[] = { code, path }` (`src/infrastructure/http/pipes/zod-validation.pipe.ts:11-16`) **không đổi**. Không thêm
`minimum`/`maximum`/`values`/`keys`. Lý do bắt buộc của quyết định có checklist (`policy-checklist.http-errors.ts:47-52`, issue
`{ code: 'custom', path: 'reason' }`) cũng giữ nguyên; chỉ ghi rõ trong mô tả OpenAPI của 12 route checklist (làm cùng E8b).

### B2. Lỗi tiền — `details.path` (E2)

| Mã | Hiện tại (`infrastructure/http/errors/money-errors.ts:22-43`) | Đích |
| --- | --- | --- |
| `VALIDATION_ERROR` (chuỗi tiền hỏng) | không có `details` | `details.issues = [{ code: 'invalid_format', path: '<path>.amount' }]` (cùng hình dạng `{code, path}` với mọi `VALIDATION_ERROR` khác) |
| `MONEY_OUT_OF_RANGE` | không có `details` | `details.path` |
| `MONEY_SCALE_EXCEEDED` | `details.allowedDecimals` | thêm `details.path` |
| `CURRENCY_NOT_SUPPORTED` | `details.currency` | thêm `details.path` |

- `path` là đường dẫn của object tiền trong body, cùng cách viết với `issues[].path`: `unitPrice`, `requestedAmount`, `lines.2.amount`.
- Cách làm: `FinanceApi.parseMoney(input, path: string, tx?)` (`finance/public/finance.api.ts:36-41`). Tham số `path` **bắt buộc** để typecheck
  chỉ ra đủ **10 lời gọi trong 7 file** (bảng dưới). Lỗi tiền ở `core/money/money.errors.ts` thêm thuộc tính `path: string | null = null`; `parseMoney` gắn `path` trước khi
  ném lại. `toMoneyApiException` đọc `path`; nếu `path` null thì giữ như cũ (an toàn cho lần gọi nội bộ).
- `budget-facts.service.ts:347` gọi `parseDecimalAmount` trực tiếp ⟹ bọc cùng helper gắn `path`.
- 10 lời gọi `parseMoney` (7 file) + 1 lời gọi `parseDecimalAmount` ở `budget-facts.service.ts:347` = 11 điểm gắn `path` (chat B đối chiếu DTO):

| Nơi gọi | `path` |
| --- | --- |
| `budgets/budget/budget-facts.service.ts:325` | `requestedAmount` hoặc `amount` theo route |
| `catalog/subscription/subscription-pricing.service.ts:26` | `unitPrice` |
| `catalog/subscription/subscription-pricing.service.ts:34` | `originalPrice` |
| `catalog/vendor/vendor-tax.service.ts:77` | `netAmount` |
| `requests/assessment/quote.service.ts:27` | `unitPrice` |
| `requests/assessment/quote.service.ts:29` | `originalPrice` |
| `requests/invoice-discrepancy/invoice-discrepancy-closure.service.ts:34` | `differenceAmount` |
| `requests/purchase-invoice/purchase-invoice-plan.service.ts:254` | `amount` |
| `requests/purchase-invoice/purchase-invoice-plan.service.ts:259` | `unitPriceOriginal` |
| `usage/vendor-account-review/out-of-process-case-closure.service.ts:171` | `amount` |

### B3. `details` cho mã FE cần để hành động (E3) — danh sách cuối, 15 mã

Tiêu chí chọn từ danh sách P1 cũ: FE phải có giá trị này mới làm được bước kế tiếp trên MF-1…MF-5, như mở bản ghi đang chặn, dựng bộ
chọn hay ghi giới hạn đúng. Mã vẫn giữ, status vẫn giữ. Lớp lỗi thêm field, nơi ném truyền giá trị, mapper đưa vào `details`.

| # | Luồng | Mã (status giữ) | `details` thêm | FE dùng để | Mapper |
| --- | --- | --- | --- | --- | --- |
| 1 | MF-1 | `ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE` (422) | `maxMonths`, `provisioningType` | ghi "tối đa N tháng với gói loại X" | `requests/access-request/access-request.http-errors.ts` (lỗi `access-request.errors.ts:104`) |
| 2 | MF-1 | `RENEWAL_REQUEST.ALREADY_REQUESTED` (409) | `requestId` | mở Request gia hạn đang mở | `requests/renewal-request/renewal-request.http-errors.ts:21` |
| 3 | MF-1 | `RETURN_REQUEST.ALREADY_REQUESTED` (409) | `requestId` | mở Request trả quyền đang mở | `requests/return-request/return-request.http-errors.ts:15` |
| 4 | MF-1 | `RETURN_REQUEST.RENEWAL_PENDING` (409) | `requestId` | mở Request gia hạn đang chặn | `return-request.http-errors.ts:16` |
| 5 | MF-1 | `SPEND.NOT_IN_QUEUE` (409) | `requestId` (lỗi đã có id) | đánh dấu dòng lỗi của lô | `requests/spend/spend.http-errors.ts:31` (**A2 FX-T1 cũng sửa file này**) |
| 6 | MF-1/4 | `FINANCE.SETUP_INCOMPLETE` (409) | `departmentId` (lỗi đã có, chưa đưa ra) | nói phòng nào thiếu Cost Center | `budgets/budget/budget.http-errors.ts:119`, `catalog/subscription/subscription.http-errors.ts:63` |
| 7 | MF-2 | `OFFBOARDING_CASE.PENDING_EVENT_EXISTS` (409) | `eventId` | mở sự kiện đang chờ | mapper offboarding (`personnel/offboarding/offboarding.http-errors.ts`) |
| 8 | MF-3 | `DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS` (409) | `eventId` | mở sự kiện đang chờ | mapper transfer |
| 9 | MF-4 | `BUDGET.COST_CENTER_REQUIRED` (422) | `costCenterIds: string[]` (các Cost Center người gọi phụ trách) | dựng bộ chọn Cost Center | `budget.http-errors.ts:146` |
| 10 | MF-4 | `BUDGET.VERSION_IN_FLIGHT` (409) | `versionId` | mở phiên bản đang chờ | `budget.http-errors.ts:203` |
| 11 | MF-4 | `BUDGET.CURRENT_EXISTS` (409) | `versionId` | mở phiên bản hiện hành | nơi ném + `budget.http-errors.ts` |
| 12 | MF-4 | `BUDGET.PROPOSAL_ALREADY_OPEN` (409) | `proposalId` | mở đề xuất đang mở | `budget.http-errors.ts:194` |
| 13 | SBF-11 | `BUDGET_REVIEW.SEAT_MONTHS_NOT_READY` (409) | `subscriptionIds: string[]` | liệt kê thuê bao chưa đủ seat-tháng | mapper review (`budgets/…`) |
| 14 | MF-1 (cấp) | `LICENSE_ASSIGNMENT.OVERLAP` (422, giữ) | `conflictingAssignmentId` khi lỗi biết, không thì vắng | mở quyền đang trùng | `licensing/licensing.http-errors.ts:~65-75` |
| 15 | MF-1 (cấp) | `LICENSE_ASSIGNMENT.IDENTIFIER_IN_USE` (422, giữ) | `conflictingAssignmentId` khi lỗi biết | mở quyền đang giữ tài khoản | như trên |

`OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID` nhánh `WITH_LAST_DAY` thiếu `details.reason` là lệch so với chính contract hiện có
(các nhánh khác đều có). Sửa trong E3 nếu chỉ một dòng (`personnel/offboarding/offboarding.http-errors.ts:15,48,113`); không thì dời 4b.

### B4. Khai mã thật mà OpenAPI chưa khai (E8a) và sửa mô tả cũ (E8b)

E8a: thêm ví dụ lỗi thật vào `@ApiErrorResponses` của controller, lấy ví dụ sẵn có trong `*_ERROR_EXAMPLES`. Status ghi **đúng như code
đang trả** (không đổi code). Bảng dưới là phần đã định vị. Danh sách đủ khoảng 35 mã là mọi dòng "(không khai trong OpenAPI)" của
`catalog/errors.md` mà code còn ném qua route; chat 5b grep chuỗi đó, đối chiếu code, rồi khai.

| Operation | Mã thêm |
| --- | --- |
| `documentAttach` | 403 `DOCUMENT.PURPOSE_FORBIDDEN` |
| `applicationUpdate` | 422 `APPLICATION.INTERNAL_HAS_NO_VENDOR` |
| `purchaseInvoicePreview`, `purchaseInvoiceSubmit` | 409 `PURCHASE_INVOICE.NO_PLACE` |
| `policyGet` | 404 `POLICY.VERSION_NOT_FOUND`; `policyDraftPut` 422 mô tả `details.codes` ⟹ `details.items` |
| `budgetAdjustmentCreate` | 404 `BUDGET.COST_CENTER_NOT_FOUND`, 422 `MONEY_*`/`VALIDATION_ERROR` tiền |
| `budgetAdjustmentDecide` | 403 `BUDGET.NOT_SPENDING_APPROVER`, `BUDGET.CONFLICT_OF_INTEREST` (thay `AUTHORIZATION.FORBIDDEN` chung trong mô tả) |
| `budgetReviewLineExplain` | 403 `BUDGET.NOT_YOUR_COST_CENTER`, 422 tiền |
| `budgetVersionCreate` | 409 `BUDGET.CURRENT_EXISTS` (đang chỉ nhắc trong mô tả) |
| `budgetCommitmentRelease` | 422 `BUDGET.COMMITMENT_REASON_REQUIRED` (mã đi qua route); các `BUDGET.COMMITMENT_*` chỉ của luồng hệ thống ghi một câu trong mô tả |
| `accessRequestCatalogLink` | 403 `ACCESS_REQUEST.OWN_REQUEST` |
| `spendApprovalDecide` | ví dụ 404 = `SPEND.REVIEW_NOT_FOUND` (đang là `ACCESS_REQUEST.NOT_FOUND`); thêm ví dụ 409 `SPEND.STEP_NOT_PENDING`, `SPEND.NO_SPEND_STEP` |
| `accessRequestPropose` | ví dụ 422 `REFERENCE_NOT_FOUND` `field = existingApplicationId` (đang `vendorId`) |
| `ghostSeatDecisionCreate` | 403 `GHOST_SEAT.NOT_DECIDER`, 409 `GHOST_SEAT.NOT_DECIDABLE`, 422 `GHOST_SEAT.EXEMPTION_REQUIRED` |
| `usageImportConfirm` | 422/409 `USAGE_SOURCE.APPLICATION_NOT_FOUND`, `APPLICATION_RETIRED`, `APPLICATION_INTERNAL` |
| `groupRequestSubmit` | ví dụ `GROUP_REQUEST.PLAN_NOT_ELIGIBLE` `reason = NOT_PAID_SOFTWARE` |
| `longLeaveStart` | ví dụ `LONG_LEAVE.EMPLOYEE_NOT_WORKING` `workState = LEFT`; `LONG_LEAVE.RETURN_DATE_INVALID` đủ enum `reason` |
| `offboardingCaseOpenRevocations` | ví dụ `OFFBOARDING_CASE.REVOCATION_NOT_SUPPORTED` có `problem` |
| `appUserChangeRole` | 409 `APP_USER.SPENDING_APPROVER_HEADS_DEPARTMENT` |
| `departmentCreate` | 422 `DEPARTMENT.CODE_INVALID` |
| `planWorkspaceProfileSet`, `subscriptionCreate` | ví dụ `PLAN.WORKSPACE_LIMIT_EXCEEDED` cả `ADMIN`; `SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED` ví dụ giá trị thật (không `QUARTERLY`) |

Danh sách đầy đủ "(không khai trong OpenAPI)" ở `catalog/errors.md` (grep chuỗi đó). Mã đi qua route HTTP ⟹ khai; mã chỉ trong mapper mà
không ai ném (`GROUP_REQUEST.LINE_NOT_FOUND`, `LONG_LEAVE.CONCURRENT_CHANGE`, `SUBSCRIPTION_RENEWAL.MID_TERM_NOT_ALLOWED`,
`USAGE_IMPORT.CANCELLED`/`EXPIRED`, `*.GROUNDS_REQUIRED`/`GROUNDS_TOO_LONG`/`REASON_REQUIRED` bị DTO chặn trước,
`BUDGET.CURRENCY_NOT_REPORTING`) ⟹ **không khai**; dọn mapper = P2.

E8b — mô tả OpenAPI/DTO cũ trái code (sửa chữ trong `@ApiOperation`/`@ApiSuccessResponse`/DTO `.describe`; không đổi hành vi, trừ dòng DTO tax-profile):

| Nguồn | Operation / chỗ | Sửa |
| --- | --- | --- |
| A1 | `accessRequestNeedDecide`, `accessRequestRenewalSubmit` | bỏ "trên 12 tháng cần xác nhận" |
| A1 | `accessRequestDraftSave` | bỏ "service account" |
| A1, R1 F1 | `accessRequestWithdraw`, `accessRequestCancelForDeparture` | bỏ "Finance gave it back"/"Finance are told" (chỉ hệ thống tự đóng mới báo Finance) |
| A1 | `needDecisionList` | bỏ "confirmed term/line of plan" |
| A1 | `spendApprovalLineDecide`, `spendBatchItemList`, `spendApprovalList` | bỏ "back to Finance", "sent to Finance", "same person holds need step" |
| A1 | `groupRequestSubmit` | "head named among them" ⟹ mã `HEAD_IN_GROUP` |
| A1 | `accessRequestTimingsGet` | bỏ "review of Finance" |
| A1 | enum cũ trong DTO | xóa giá trị `PLAN_LINE_MOVED`, `FINANCE_OUTCOME_WHILE_WAITING`, `RETURNED_BY_FINANCE`, `CONFLICT_OF_INTEREST`, `SERVICE_ACCOUNT` khỏi enum **response** chỉ khi code không còn trả (kiểm trước; nếu hàng cũ còn trả thì giữ, sửa mô tả "chỉ ở bản ghi cũ") |
| A2 | `meDepartureNoticeGet` | mô tả theo QĐ-100q; bỏ mức `OVERDUE_HANDOVER` khỏi mô tả nếu không đọc được |
| A3 | `budgetMine` ("published department ceiling"), `budgetVersionCreate` ("never published"), `budgetVersionHistoryList` (sửa/nạp dòng), `budgetProposalGet` ("lines paged"), baseline `spentThisYear` ("seat-months not in yet"), `seatsAssigned` (service account), `departments` ("division of the ceiling"), `explanationStatus` (`NO_HEAD`), `budgetCommitmentList` (MANAGER cũng đọc), `budgetCommitmentReleases` (đủ lý do) | viết lại theo code |
| A4 | `DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED` (mô tả), `provisioningTaskCompleteRevocation` (`K1_CHECKLIST_OUT_OF_ORDER` cũ), `deviceHolderChange` (ghi đúng 422 hiện có; đổi 404 = P2) | viết lại theo code |
| A5 | `managerDashboardGet` | bỏ "open reviews after a transfer" |
| R2 §3.3 | `provisioning-tasks.controller.ts:95` | bỏ `REQUEST_BOUNDARY_NOT_CHECKED`/`RESPONSIBLE_NOT_IN_DEPARTMENT` khỏi mô tả nếu không còn ném |
| R2 §3.4 | DTO `PUT /vendors/{id}/tax-profile` | DTO ≤ 20 dòng, `taxType` ≤ 100 ký tự cho khớp `finance/tax-profile/tax-profile.policy.ts:14-15` (vượt ⟹ `VALIDATION_ERROR` thay vì lỗi handler) |
| R2 §3.5 | `applicationList.emptyState` | bỏ `NO_SUBSCRIPTIONS`/`CONTRACTS_AND_SUBSCRIPTIONS` khỏi schema |
| A4 | `assignmentExpiryStartRevocation` | OpenAPI khai 409 `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED`, code trả 403 (như 10 route khác) ⟹ sửa OpenAPI thành 403 |
| B1 | 12 route quyết định có checklist | ghi rõ: từ chối/trả về thiếu lý do ⟹ `VALIDATION_ERROR` với `issues[0].path = "reason"` |

Không đụng (5a sở hữu): mô tả `subscriptionRenewalDecide` `PROPOSAL_STALE` và mọi route SBF-20; route báo lỗi SaaS.

### B5. Dời 4b

1. **Lệch status cùng luật.** Prompt 5 không đổi status; 4b quyết định có đổi hay không, đổi thì ghi breaking cho FE.

| Mã | Lệch |
| --- | --- |
| `SPEND.SUPPLEMENT_TERM_MONTHS_OUT_OF_RANGE`, `SPEND.SUPPLEMENT_TERM_NOT_ASKED`, `SPEND.SUPPLEMENT_TERM_NOT_REDUCED`, `SPEND.SUPPLEMENT_NO_CHANGE` | 409, trong khi `ACCESS_REQUEST.TERM_*` cùng nghĩa là 422 (`requests/spend/spend.http-errors.ts:55`) |
| `APP_USER.SELF_CHANGE_FORBIDDEN` | 409, trong khi `EMPLOYEE`/`PERSONNEL.SELF_CHANGE_FORBIDDEN` là 403 (`identity-access/accounts/account.http-errors.ts:46`) |
| `LICENSE_ASSIGNMENT.OVERLAP`, `IDENTIFIER_IN_USE`, `EXPECTED_END_REQUIRED` | 422, trong khi `SEAT_CAPACITY` cùng họ là 409 |
| `PROVISIONING.SUBSCRIPTION_QUANTITY_UNKNOWN` vs `SEAT_BASELINE.QUANTITY_UNKNOWN` | 422 vs 409 |
| `PROVISIONING.RESPONSIBLE_INVALID` vs `RESPONSIBLE_NOT_IN_DEPARTMENT` | 422 vs 409 |
| `DEVICE.HOLDER_NOT_FOUND` vs `HOLDER_NOT_WORKING` | 422 vs 409; `deviceHolderChange` 422 thay vì 404 |
| `CONTRACT.SUBSCRIPTION_NOT_FOUND` | 404 cho tham chiếu trong body, nơi khác dùng 422 |
| `DOCUMENT.PURPOSE_NOT_AVAILABLE` | 409 cho điều kiện cố định |
| `DOCUMENT.PURPOSE_MISMATCH`/`ALREADY_ATTACHED`/`NOT_READY_TO_ATTACH` | 422 / 409 trong cùng nhóm |
| `PROFILE.AVATAR_TYPE_UNSUPPORTED` / `AVATAR_TOO_LARGE` | 415/413 vs `HTTP_PAYLOAD_TOO_LARGE` |
| `AUTH.UNAVAILABLE` / `SERVICE_UNAVAILABLE` / `TOKEN_VERIFICATION_UNAVAILABLE` | ba mã 503 cùng nghĩa |
| `SPEND.REVIEW_NOT_FOUND` vs `ACCESS_REQUEST.NOT_FOUND`; `EMPLOYEE.NOT_FOUND` vs `ORGANIZATION.EMPLOYEE_NOT_FOUND` | hai mã 404 cho cùng tình huống |

2. **Mã gộp nhiều luật ⟹ một mã mỗi luật.** Việc này đổi mã nên breaking. 4b tách mã và giữ mã cũ một đợt làm bí danh, hoặc thêm
   `details.reason`:
   - MF-1: `ACCESS_REQUEST.NOT_REQUESTER`, `ACCESS_REQUEST.OWN_REQUEST`, `SPEND.NOT_CHECKABLE`, `POLICY.CHECKLIST_INCOMPLETE` (tách `unexpected`).
   - Luật nghiệp vụ đang trả dưới `VALIDATION_ERROR`: RETURN một phần, `extensionMonths`+`longTerm`, `reserveConfirmations`.
   - MF-2/3: `*.PLACEMENT_OVERLAP`, `DEPARTMENT_TRANSFER.NO_CHANGE`.
   - MF-4: `BUDGET.NOT_YOUR_COST_CENTER`, `BUDGET.VERSION_NOT_EDITABLE`, `BUDGET_CYCLE.NOT_OPEN`, `AUTHORIZATION.FORBIDDEN` ở route ngân sách.
   - MF-5: `GHOST_SEAT.EXEMPTION_TOO_LONG`, `REVOCATION.COMPLETION_NOT_ALLOWED`, `REVOCATION.ACCESS_STATE_*`.
   - Các mã gộp khác trong `GENERIC-ERRORS.md`.
3. **`details` không bắt buộc** cho bước kế tiếp:
   - Đã ở P1 cũ, nay bỏ: `ACCESS_REQUEST.EVIDENCE_REQUIRED.field`, `PROVISIONING.REQUEST_*.requestId` (FE đã biết Request đang cấp),
     `BUDGET_ADJUSTMENT.OVER_UNALLOCATED.costCenterId`, `GHOST_SEAT.SEAT_NOT_REVOCABLE.items[].problem`.
   - Mọi dòng `details` còn lại của `GENERIC-ERRORS.md`.
4. **Việc còn lại khác:**
   - 429 `details.retryAfterSeconds`; khai 500 chung; `IDEMPOTENCY_KEY_INVALID`.
   - Tiền trong `details` dạng Money.
   - Dọn mã chết trong mapper (`GROUP_REQUEST.LINE_NOT_FOUND`, `LONG_LEAVE.CONCURRENT_CHANGE`,
     `SUBSCRIPTION_RENEWAL.MID_TERM_NOT_ALLOWED`, `USAGE_IMPORT.CANCELLED`/`EXPIRED`, `*.GROUNDS_*`, `BUDGET.CURRENCY_NOT_REPORTING`).
   - `EMPLOYEE`/`PERSONNEL.SELF_CHANGE_FORBIDDEN` message nhúng lệnh vận hành.
   - `departmentDeactivate` còn `details.serviceAccounts`; cờ `blockedByDeparture`.
   - `SUBSCRIPTION_RENEWAL.*` (sau 5a); `SAAS_ISSUE.*`, `AI.*`.
   - 13 dòng params P2 ở A8.

### B6. Điều kiện xong (lỗi)

1. `money-errors.spec.ts`:
   - Mỗi lỗi tiền có `path` ⟹ `details.path` (riêng chuỗi hỏng ⟹ `issues[0].path = '<path>.amount'`).
   - `path` null ⟹ như cũ.
2. 15 mã ở B3: spec mapper (`*.http-errors`) khẳng định `details` mới, và **status không đổi**. Unit spec của nơi ném (đã có) assert giá trị truyền vào.
   Một http-spec của route tiền (ví dụ assessment) assert `details.path`.
3. Script kiểm tạm, không commit (mẫu ở D2), đọc `openapi.json`: mọi cặp operation→mã của E8a có ví dụ. Kết quả mong đợi: không dòng MISSING.
4. `git diff` của phase E không có dòng `HttpStatus.` nào bị đổi (grep diff), và không mã nào bị đổi tên hay xóa.
5. `pnpm openapi:export` không drift sau commit. `pnpm test:http --maxWorkers=2` xanh; lỗi do test cũ ngoài phạm vi ghi vào "Nợ test cho FIX-TEST".

---

## Phần C — Yêu cầu cập nhật tài liệu FE (việc của chat điều phối SAU khi code xong; 5b không sửa repo Docs)

- `catalog/notifications.md`:
  - Ví dụ wire thêm `title`, `message`, `target`.
  - Câu "Ở revision này thông báo không có chữ" đổi thành "BE trả `title`/`message` theo `Accept-Language` từ revision <hash 5b>; FE hiện
    thẳng, giữ bộ câu ở trang này làm dự phòng khi field vắng".
  - Mỗi mục thêm dòng `target` (operationId + pathParams).
  - `subject.type` luôn `UPPER_SNAKE`: bỏ `LicenseAssignment`, `ProvisioningTask`, `HandoverDuty`, `Employee` khỏi các mục.
  - `STEP_SLA_REMINDER` thêm `recipientRole`; ghost seat `employeeId` có thể `null`; ghi rõ mã nào do 5a thêm.
- `catalog/errors.md`:
  - Mục "Lỗi chung": `VALIDATION_ERROR` **không đổi** (FE lấy giới hạn từ OpenAPI). Chuỗi tiền hỏng có `issues[{code, path}]`.
    `MONEY_*`/`CURRENCY_NOT_SUPPORTED` có `details.path`.
  - 15 mã ở B3: sửa cột `details`, và câu tiếng Việt dùng khóa mới (ví dụ `TERM_MONTHS_OUT_OF_RANGE`: "Thời hạn tối đa {details.maxMonths} tháng").
  - Bỏ nhãn "(không khai trong OpenAPI)" ở mã đã khai (E8a).
  - Không đổi cột HTTP nào.
- `catalog/README.md`:
  - "Quyết định của Owner": ghi BE đã trả chữ, và quy ước lỗi 17/11 (field + mã ngắn; một mã mỗi luật + metadata tối thiểu).
  - Thêm formatter `:quarter`.
- `changes/<ngày>-prompt5.md` — mục **Breaking FE của B** (chat B chép vào báo cáo cuối; review 5B-4, chỉ những gì còn đúng với bản thu gọn):
  - `subject.type` luôn `UPPER_SNAKE`: 4 giá trị cũ `LicenseAssignment`, `ProvisioningTask`, `HandoverDuty`, `Employee` đổi thành
    `LICENSE_ASSIGNMENT`, `PROVISIONING_TASK`, `HANDOVER_DUTY`, `EMPLOYEE` (cả hàng cũ, áp lúc đọc).
  - `STEP_SLA_REMINDER` thêm param `recipientRole` (dòng mới); ghost seat `employeeId` có thể `null` thay vì `""` (N7).
  - DTO `PUT /vendors/{id}/tax-profile` siết: ≤ 20 dòng, `taxType` ≤ 100 ký tự ⟹ vượt nay là **422 `VALIDATION_ERROR`** (E8b R2 §3.4).
  - Enum **response** bỏ giá trị cũ nếu code không còn trả (E8b A1: `PLAN_LINE_MOVED`, `FINANCE_OUTCOME_WHILE_WAITING`, `RETURNED_BY_FINANCE`,
    `CONFLICT_OF_INTEREST`, `SERVICE_ACCOUNT`); `applicationList.emptyState` bỏ `NO_SUBSCRIPTIONS`/`CONTRACTS_AND_SUBSCRIPTIONS` (E8b R2 §3.5).
    Chat B ghi rõ giá trị nào thực sự bị bỏ.
  - `assignmentExpiryStartRevocation`: OpenAPI sửa 409 ⟹ **403** `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` cho khớp code (code không đổi).
  - Lỗi tiền: chuỗi tiền hỏng nay có `details.issues[{code, path}]`; `MONEY_*`/`CURRENCY_NOT_SUPPORTED` thêm `details.path`; 15 mã B3 thêm `details` (chỉ thêm).
  - Thông báo thêm `title`, `message`, `target`; header `Accept-Language` (chỉ thêm).
  - Danh sách lệch status (B5.1) "sẽ xem ở 4b".
- Sinh lại `reference/*` (`node tools/build-api-docs.mjs --be <BE> --check`), `enums.md`, `api-index.md`.

---

## Phần D — Plan và task cho chat 5b (Sonnet)

### D0. Quy ước chạy

- **Nhánh:** `feat/p5-b-messages` từ `dev`, worktree `Code/be-p5-b`, mở **ngay** cùng A1/A2/C (`PLAN.md` §2). Thứ tự trong chat:
  1. Phase N (N1 → N7, trừ N3d) trên nền `dev` — không chờ ai.
  2. Khi điều phối báo **A2 đã merge vào `feat/p5`**: rebase lên `feat/p5`, chạy **Phase E** (E3a/E2b đụng file A2 đã sửa).
  3. Khi **A1 đã merge**: rebase lại, làm **N3d** (mẫu câu mã mới/đổi của A1 + A2, `satisfies` bắt thiếu), `openapi:export` một lần.
  B merge vào `feat/p5` **cuối** (sau C). Migration (nếu cần, dự kiến không): dải `20261117130000`+.
  Commit đứng tên Owner, không dòng đồng tác giả AI. Không push, không deploy.
- **Bộ kiểm nhanh sau mỗi task:**
  - `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`.
  - `pnpm openapi:export`; commit `openapi.json` nếu đổi.
  - Test theo file: `pnpm test -- <spec>`, `pnpm test:http -- <file>`, `pnpm test:integration -- <file>`.
  - Cuối mỗi phase: `pnpm test:http --maxWorkers=2`.
  - Không chạy `pnpm check` hay integration toàn bộ; Owner/CI chạy.
- **Test:** đỏ trước, xanh sau. Test cũ hỏng vì thêm field ⟹ sửa nếu thuộc file task đụng; ngoài phạm vi ⟹ ghi "Nợ test cho FIX-TEST".
- **Báo cáo:** không viết file `.md` báo cáo. Báo cáo cuối liệt kê task, commit, lệnh đã chạy, kết quả.

### D1. Phase N — thông báo (prompt 5)

| Task | Mục tiêu | File (≤ ~5) | Test | Giờ |
| --- | --- | --- | --- | --- |
| **N1** | `localeFromAcceptLanguage` + `@RequestLocale()` | mới `src/infrastructure/http/decorators/request-locale.decorator.ts` + `.spec.ts` | unit: mọi ví dụ A3, header dài, `q` sai | 0.4 |
| **N2** | Kiểu + renderer thuần + formatter (`date`, `enum`, `list`, `quarter`, `vnd`, `name`, `[ ]`, biến thể) + bảng `NAME_KIND_BY_KEY`/`NAME_FALLBACK` | mới `inbox/notification-text/notification-text.types.ts`, `notification-text.policy.ts` (chưa gộp bảng), `notification-text.policy.spec.ts` | unit: từng formatter, `[ ]` ẩn/hiện, biến thể có/không case, cụm chung khi thiếu tên | 1.0 |
| **N3a** | Chép mẫu câu MF-1 + SLA (41) và nhãn enum của chúng từ catalog | mới `notification-texts-mf1.types.ts`, `notification-labels.types.ts` | (test duyệt bảng ở N3c) | 0.9 |
| **N3b** | Chép mẫu câu org/MF-2/MF-3/policy (21), budget (26), licensing (30) + nhãn — mã có trên `dev` | mới `notification-texts-org.types.ts`, `-budget.types.ts`, `-licensing.types.ts`, sửa `notification-labels.types.ts` | — | 1.2 |
| **N3c** | Gộp `NOTIFICATION_TEXTS satisfies Record<InAppNotificationCode, …>` + test duyệt toàn bảng (A11.1) | `notification-text.policy.ts`, `notification-text.policy.spec.ts` | unit A11.1 (đỏ khi thiếu mã/biến lạ/nhãn thiếu) | 0.5 |
| **N3d** | **Sau khi A1 + A2 merge `feat/p5`:** mẫu câu + nhãn cho mã **mới và mã đổi params** của A1/A2 theo bảng bàn giao (`SPEC-5A-SBF20.md` §13, `SPEC-5A-FIXES.md` §1.B) và mục "Thông báo mới cho 5b" trong báo cáo của hai chat (báo cáo thắng nếu khác); viết lại `SUBSCRIPTION_RENEWAL_ALERT` (biến thể `commitment`, khóa cũ trong `[ ]`), sửa `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`/`_EXPIRY_MARKED` theo nghĩa mới. **Review 2 — nhãn phải thêm** (A11.1 không bắt thiếu một giá trị enum, chỉ ra chữ thô): `problem` `NO_NOTICE_DEADLINE` của `SUBSCRIPTION_RENEWAL_DATA_QUALITY`, `commitment`/`choice`/`outcome` (SBF20 §13), `category`/`impact`/`fromState`/`toState`/`trigger` (SaaS) và `source` (sai lệch NCC) lấy từ enum DTO trên nhánh, `cause` `RESUBMITTED`/`SPEND_SENT`. Chạy `pnpm openapi:export` **trước** spec target (route `deviceStopRequestList` chỉ có sau A2) | `notification-texts-licensing.types.ts`, mới `notification-texts-ops.types.ts`, `notification-texts-mf1.types.ts` (`cause` mới của `STEP_ASSIGNED`), `notification-labels.types.ts`, `notification-text.policy.ts`, `notification-target.policy.ts` (target mã mới) | A11.1 xanh với đủ mã sau rebase; `notification-target` spec có `target` của mã mới | 0.8 (Review 2: 11 mã mới + 3 đổi + ~10 bảng nhãn) |
| **N4** | `target` + `canonicalSubjectType`; sửa nơi ghi `subject.type`; chuẩn hóa ở đường ghi (không ném, A6) | mới `inbox/notification-target.policy.ts` + spec (đọc `openapi.json`); sửa `licensing/licensing-alerts.policy.ts`, `licensing/provisioning/provisioning-task-frame.service.ts`, `notifications/inbox/inbox.service.ts`, `inbox/held-notification.service.ts` (+ spec) | unit target (operationId tồn tại, GET, đủ path param); spec chuẩn hóa + warn, không ném (A11.3); spec quét literal `subject: { type:`; sửa assert `'LicenseAssignment'` cũ: **`test/integration/licensing/license-expiry-inbox.integration-spec.ts:92`** (chỗ duy nhất assert subject thông báo, Review 2). **Không** đổi `resource_type` của Audit Trail (`'ProvisioningTask'`, `'LicenseAssignment'` trong `audit_events` — ~37 file test đọc chúng): chuẩn hóa chỉ áp cho `subject` của thông báo | 0.6 |
| **N5a** (Review 2: tách N5) | Extension point tên + wiring | mới `notifications/public/notifications.extension-points.ts` (`@Injectable()`); provide + export ở `notifications.module.ts`; `test/gates/module-graph.gate-spec.ts` (`PUBLIC_CONTRACT_EXPORTS` thêm `'NotificationsModule: NotificationNameContributions'`); `notifications/README.md` §Extension point | gate `module-graph` (R10), `extension-wiring`; `pnpm test:http -- test/http/platform/extension-points.http-spec.ts` (tên point duy nhất) | 0.3 |
| **N5b** | 3 bên đăng ký + hàm đọc tên theo lô | listener theo capability sở hữu bảng (A5 "Nơi khai listener"): `organization` (khai ở `organization-http.module.ts`), `catalog` (`catalog.module.ts`), `requests` (`requests.module.ts`); mỗi kind một hàm repo `namesOf` mới (trừ SUBSCRIPTION dùng `SubscriptionRepo.labelsOf`); README 3 module "Đăng ký vào". ≈ 8–10 file ⟹ commit theo module (3 commit) | unit mỗi listener (`binds` đúng, kind đúng, id lạ vắng, không ném); gate `extension-wiring` (không thêm ngoại lệ), `module-graph` (graph cài đặt không có `NotificationsModule`), `capability-graph`, `arch:check`; boot DI thật: `pnpm test:integration -- test/integration/identity-access/worker-mail-loop.integration-spec.ts test/integration/installation/installation.integration-spec.ts` (gate chỉ đọc metadata, không resolve DI) | 1.1 |
| **N6** | `InboxViewService` + mapper + controller + DTO + OpenAPI | mới `inbox/inbox-view.service.ts` (provider **chỉ** ở `notifications-http.module.ts`), `inbox/inbox.mapper.ts`; sửa `inbox.controller.ts`, `inbox.dto.ts`, `notifications-http.module.ts` | integration A11.4 (thêm vào `test/integration/notifications/in-app-notifications.integration-spec.ts`, file ≤ 800 dòng — tách nếu vượt); `pnpm openapi:export` | 0.8 |
| **N7** | Params P1: `STEP_SLA_REMINDER.recipientRole`; ghost seat `employeeId` `""` → `null` | `notifications/inbox/inbox.policy.ts` (khóa mới), `requests/sla/step-sla.policy.ts` (`noticeParamsOf` `:203` nhận thêm `role`, chỉ ghi `recipientRole` cho `STEP_SLA_REMINDER`) (+ spec), `requests/sla/reminder-writer.service.ts:71` (truyền `role`), `optimization/decision/decision-return.service.ts:124`, `decision-reminder.service.ts:64,132` (Review 2: bỏ `decision-routing.service.ts` — không có `?? ''`) | unit `step-sla.policy.spec`; spec/integration ghost seat có sẵn assert `null`; `test/integration/notifications/step-sla.integration-spec.ts` | 0.4 |

Thứ tự: N1 ∥ N2 → N3a ∥ N3b → N3c → N4 ∥ (N5a → N5b) → N6 → N7 → (chờ A2 merge) Phase E → (chờ A1 merge) N3d. **Checkpoint N**: bộ kiểm nhanh +
`pnpm test:http --maxWorkers=2` + `pnpm test:integration -- test/integration/notifications` + `pnpm test:e2e -- mobile-channel-smoke` (shape thông báo).
Tổng Phase N ≈ **7.6 giờ** (N3 chép ~129 mã × 2 ngôn ngữ + nhãn ≈ 3,4 giờ theo review 5B-6, gồm N3d 0,8; N5a+N5b 1,4 — Review 2: +0,6 so bản trước vì phải viết hàm đọc tên theo lô).

### D2. Phase E — lỗi (thu gọn, mục tiêu 2–2,5 giờ)

| Task | Mục tiêu | File (≤ ~5 mỗi lô) | Test | Giờ |
| --- | --- | --- | --- | --- |
| **E2a** | Lõi lỗi tiền có `path` | `core/money/money.errors.ts`, `infrastructure/http/errors/money-errors.ts` (+ `money-errors.spec.ts`), `finance/public/finance.api.ts` | B6.1 | 0.25 |
| **E2b** | 10 lời gọi `parseMoney` + `parseDecimalAmount` truyền `path` (theo lỗi typecheck) | 7 file ở bảng B2 (chia 2 lô: budgets+catalog; requests+usage). `out-of-process-case-closure.service.ts` cũng do A2 (FX-T5) sửa ⟹ đọc lại sau rebase | http-spec có sẵn của một route tiền assert `details.path` | 0.25 |
| **E3a** | `details` mã 1–5 (B3) | `access-request.http-errors.ts` + `access-request.errors.ts`, `renewal-request.http-errors.ts`, `return-request.http-errors.ts`, `spend.http-errors.ts` (**sau khi A2 merge**) + nơi ném | spec mapper + unit nơi ném | 0.35 |
| **E3b** | `details` mã 6, 9–13 | `budgets/budget/budget.http-errors.ts`, mapper review, `catalog/subscription/subscription.http-errors.ts` + nơi ném | spec mapper; integration budget có sẵn theo file | 0.3 |
| **E3c** | `details` mã 7, 8, 14, 15 | mapper offboarding, transfer, `licensing/licensing.http-errors.ts` + nơi ném | spec mapper | 0.25 |
| **E8a** | Khai mã thật chưa khai (B4) | khoảng 12–15 controller, chia 3 lô: (i) requests+purchase; (ii) budgets; (iii) catalog/policies/optimization/usage/personnel/organization | script dưới; `pnpm test:http -- test/http/platform/openapi-response-examples.http-spec.ts` | 0.6 |
| **E8b** | Sửa mô tả OpenAPI/DTO cũ (bảng E8b) | khoảng 15 controller/DTO, chia 3 lô | `pnpm openapi:export`; `pnpm test:http -- test/http/platform/openapi-read-wording.http-spec.ts` | 0.5 |

Script kiểm E8a (chạy tạm, không commit; điền đủ bảng B4 vào `want`):
`node -e "const d=require('./openapi.json');const want={documentAttach:['DOCUMENT.PURPOSE_FORBIDDEN'],applicationUpdate:['APPLICATION.INTERNAL_HAS_NO_VENDOR']};for(const p of Object.values(d.paths))for(const op of Object.values(p)){const w=want[op.operationId];if(!w)continue;const s=JSON.stringify(op.responses);for(const c of w)if(!s.includes(c))console.log('MISSING',op.operationId,c)}"`

Thứ tự:
1. E2a.
2. E2b ∥ E3a ∥ E3b ∥ E3c.
3. E8a.
4. E8b.

**Checkpoint E**: bộ kiểm nhanh, B6.4 (không đổi `HttpStatus`), và `pnpm test:http --maxWorkers=2`. Tổng Phase E ≈ **2.5 giờ**.

### D3. Song song và xung đột

| File / vùng | 5a | 5c | Cách xử lý |
| --- | --- | --- | --- |
| `notifications/public/notifications.types.ts`, `inbox/inbox.policy.ts` | A1 + A2 thêm mã mới / đổi params `SUBSCRIPTION_*` (không dọn khóa chết) | — | Phase N làm trên `dev`; N7 thêm khóa `recipientRole` (một dòng, gộp dễ); N3d phủ mã A1/A2 sau khi hai nhánh merge `feat/p5` |
| `requests/spend/spend.http-errors.ts`, `group-request.http-errors.ts` | A2 FX-T1 sửa 500 `COMMITMENT_*` | — | E3a sau khi A2 merge `feat/p5`; đọc lại file trước khi sửa |
| `usage/vendor-account-review/out-of-process-case-closure.service.ts` | A2 FX-T5 (thông báo `REPORT_ONLY`) | — | E2b (`parseMoney` `:171` thêm `path`) sau khi A2 merge; khác dòng (review 5B-7) |
| `identity-access/accounts/account.http-errors.ts` | A2 FX-T7 | — | 5b không đụng |
| `requests/spend-submission/spend-batch.service.ts`, `requests/status/rules/*` | A2 FX-T3a/b | — | 5b không đụng |
| `identity-access/accounts/*` | `loginEmail = workEmail` | — | 5b không đụng nữa (đổi status đã dời 4b) |
| `licensing/subscription-renewal/*`, route SBF-20 | A1 thiết kế lại | — | 5b không đụng |
| `requests/status/rules/*` | thêm thông báo MF-1 | — | 5b không đụng |
| `notifications/email/*` | email | — | 5b không đụng |
| `ai-assist/*` | — | AI | 5b không đụng |
| `openapi.json` | đổi | đổi | luôn chạy `pnpm openapi:export` sau khi rebase; không sửa tay |

Trong 5b:
- Song song được: N1 ∥ N2; N4 ∥ N5a/N5b; E2b ∥ E3a ∥ E3b ∥ E3c.
- Phase N và Phase E độc lập, chỉ chung `openapi.json`. Owner chọn **một chat B** (4 chat song song, `PLAN.md`): Phase N trước, Phase E sau khi A2 merge.

### D4. Quy ước thông báo MỚI hoặc ĐỔI PARAMS do A1/A2 làm (review 5B-3)

- A1/A2 thêm mã vào `IN_APP_NOTIFICATION_CODES` + `PARAM_KEYS_BY_CODE` như cũ và **không** viết mẫu câu (bảng TypeScript chưa có trên nhánh của
  họ). Mã **đổi params** (`SUBSCRIPTION_RENEWAL_ALERT`, `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` thêm `renewalId`) **giữ khóa cũ** để dòng cũ đọc được.
- Bảng bàn giao đã có sẵn trong spec: `SPEC-5A-SBF20.md` §13 (4 mã đổi/mới nghĩa + 3 mã mới, câu VI/EN, nhãn enum) và `SPEC-5A-FIXES.md` §1.B
  (8 mã mới + 2 `cause`, câu VI/EN). A1/A2 vẫn ghi trong báo cáo cuối mục "Thông báo mới cho 5b" (chỉ lệch so với bảng + mã bị cắt). Chat điều
  phối chuyển cho B và vào `catalog/notifications.md`.
- B đưa các mã đó vào **N3d**; `satisfies Record<InAppNotificationCode, …>` + test N3c bảo đảm không sót mã mới. Mã đổi params không bị
  `satisfies` bắt ⟹ N3d đối chiếu danh sách "đổi params" ở bảng bàn giao; test A11.1 bắt biến lạ (khóa không có trong `PARAM_KEYS_BY_CODE`).

---

## Phần E — Câu hỏi Owner

| Mã | Câu hỏi | A (khuyến nghị) | B |
| --- | --- | --- | --- |
| P5B-Q1 | **Đã chốt (Owner 17/11, `PLAN.md`):** giữ 4 chat; B là **một** chat, Phase N chạy ngay từ `dev`, Phase E sau khi A2 merge `feat/p5`, N3d sau khi A1 merge. B ≈ 8,7–10 giờ, là đường dài nhất (~10–11 giờ đồng hồ) | — | — |
| P5B-Q2 | Câu thông báo có hiện tên thật (Request, nhân viên, phòng, Cost Center, gói…) không? | **Có**: BE tra tên lúc đọc qua extension point (N5, A5), đúng câu catalog Owner đã chốt. Tên chỉ hiện cho người nhận của thông báo, chỉ tên hiển thị; `params` vẫn không chứa tên. | Tạm dùng cụm chung ("một yêu cầu", "một nhân viên"…), bỏ N5 (−1.0 giờ), làm ở 4b; contract không đổi. |

Không có câu hỏi khác. Các điểm sau đều có nguồn (Owner 16/11 và 17/11, catalog, luật forward-only) và đã ghi ở trên:
- không backfill params;
- chuẩn hóa `subject.type`;
- quy ước lỗi thu gọn;
- không đổi status hay tên mã ở prompt 5.

## Phần F — Ước lượng và phần cắt được

| Phần | Giờ Sonnet |
| --- | --- |
| Phase N (N1–N7 + N3d) | 7.6 (review 5B-6: chép câu ~3 giờ; Review 2: N5 1,4, N3d 0,8) |
| Phase E (E2a–E8b, bản thu gọn) | 2.5 |
| **Tổng B ở prompt 5** | **≈ 9.3–10.5** (Review 2; một chat; Phase E chờ A2 merge nên B là đường dài nhất ≈ 10–11 giờ đồng hồ) |
| Dời 4b (B5 + 13 dòng params P2 ở A8) | khoảng 6–8 |

Cắt nếu trễ, theo thứ tự ít hại nhất (`PLAN.md` §5):

1. Phần `target` của N4 ⟹ trả `target: null` (vẫn giữ field), bảng target làm ở 4b (−0.4 giờ). Giữ phần `subject.type`.
2. Lô (iii) của E8a và E8b (catalog/policies/optimization/usage/personnel/organization) ⟹ 4b (−0.4 giờ).
3. N5a+N5b (tra tên) ⟹ câu dùng cụm chung `NAME_FALLBACK`, làm ở 4b (−1.4 giờ; contract không đổi).
4. E8b toàn bộ ⟹ 4b (−0.5 giờ; mô tả OpenAPI cũ còn lệch, ghi trong changes).

Không cắt: N1–N3 (lõi quyết định Owner), N3d (thiếu thì typecheck đỏ sau rebase), N6, E2, E3.
