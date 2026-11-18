# AUDIT P3 · B2-C — K1-GR (checklist cấp `K1`) và K1-GR-S (seed/flows)

- **Phạm vi:** `52a52362..5b8ac15d` trên `feat/fe-feedback` (b27d2ba7, 6ab1940d, 36cc8cb0, 08657270, 3dcf3559, 32aeebbd, 41226ba3,
  5b8ac15d) và `prisma/migrations/20261113004100_k1gr_grant_checklist/migration.sql`. Mọi dòng trích ở `5b8ac15d`.
- **Cách làm:** CHỈ ĐỌC qua git (`git diff`, `git show`, `git grep` ở `5b8ac15d`); không sửa code, không checkout, không chạy
  pnpm/jest/docker. Mọi kết luận "xanh/đỏ" dưới đây là **suy từ đọc code**, chưa có lần chạy nào của reviewer.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review 5 trục, phân mức Critical/Required/Optional/Nit);
  `superpowers:verification-before-completion` (verification: tách rõ điều đã kiểm bằng chứng đọc code với điều chưa chạy).
- **Nguồn đối chiếu:** `QĐ-111az` (vế cấp: "đăng ký bằng email công ty của chính người dùng, không bật MFA bằng thiết bị cá nhân"; "IT
  tick đủ và có bằng chứng mới hoàn tất"; "áp cho mọi thu hồi K1 … và cho bước cấp K1"), `QĐ-111q`, `QĐ-103d`(1), `QĐ-77i`, `QĐ-110b`;
  BRD `FR-2.9`; "Quy trình và chính sách theo main flow" dòng 375; MF-1 bước 16; `US-07-01` AC-7, AC-9; `Bộ chính sách khởi tạo` §3, §11;
  SPEC §K1-GR ("đủ tick (`doneAt` đúng thứ tự) + bằng chứng (422 `PROVISIONING.K1_CHECKLIST_INCOMPLETE`)"); PLAN K1-GR.1;
  OVERNIGHT-DECISIONS D-61, K1-GR-Q1, K1-GR-O1…O6; HANDOFF-CODE K1-GR.1/G/R1/S.

## Kết luận

**Không có Critical.** Code sản phẩm của K1-GR đúng nghiệp vụ, đúng transaction và đúng kiến trúc; seed/flows đã gửi checklist ở mọi
chỗ hoàn tất cấp `K1` mà tôi tìm được. Còn **2 Required** (cả hai ngoài code sản phẩm: hợp đồng FE và bằng chứng chạy), **5 Optional**,
**4 Nit**. D-61 không trái QĐ/BRD (thứ tự hai mục có trong SPEC; QĐ-111az không đòi thứ tự cho vế cấp — xem B2C-O3).

## Required

### B2C-R1 — Hợp đồng FE đổi phá vỡ mà tài liệu API FE chưa đổi (K1-GR-O3 "để lại")

- **Mức:** Required (chặn bàn giao FE/merge `dev`, không chặn code).
- **Chỗ:** `src/modules/licensing/provisioning/k1-checklist/provisioning-k1-checklist.policy.ts:237-249` (`planK1GrantChecklist`:
  `claim === undefined` ⟹ `refuse('INCOMPLETE')`), `tasks/provisioning-grant-completion.service.ts:68-74`; OVERNIGHT-DECISIONS dòng 223.
- **Kịch bản:** FE hiện hoàn tất mọi tác vụ cấp bằng `{ evidence }`. Sau khi deploy, mọi tác vụ cấp `K1` (kể cả tác vụ đang
  `IN_PROGRESS` từ trước deploy) nhận 422 `PROVISIONING.K1_CHECKLIST_INCOMPLETE` ⟹ MF-1 bước 16 với `K1` (ChatGPT Plus, Cursor Pro,
  Grammarly Pro của dataset demo) đứng ở FE cho tới khi FE gửi `k1Checklist`.
- **Căn cứ:** D-61 (6) tự ghi "đổi hợp đồng cho FE"; quy trình bàn giao FE dùng `Docs/Figma UI-UX/API-Integration/`.
- **Cách sửa:** ở lượt tài liệu API FE: body `POST /provisioning-tasks/{id}/complete` thêm `k1Checklist { items[{ code, done, doneAt }],
  evidence? }`; ba mã 422 `PROVISIONING.K1_CHECKLIST_INCOMPLETE|OUT_OF_ORDER|NOT_ALLOWED` (với tác vụ `K1` cả ba có thể mang
  `details { variant: GRANT, codes }` — xem B2C-N1); thẻ `k1Checklist.variant = GRANT` ở `POST /provisioning-tasks`,
  `GET /provisioning-tasks/{id}` và route ghi trả `task`; glossary `COMPANY_EMAIL_REGISTERED`, `NO_PERSONAL_DEVICE_MFA`; ghi rõ "chỉ
  `evidence` cho `K1` nay 422". Báo FE trước deploy.
- **Test:** không cần test BE thêm; kiểm FE bằng luồng demo R18 `chatgpt-plus`.

### B2C-R2 — Chưa có bằng chứng chạy cho seed thật, `test:flows`, e2e và integration đủ sau commit cuối

- **Mức:** Required (cổng verification, không phải lỗi code).
- **Chỗ:** HANDOFF-CODE K1-GR-S và OVERNIGHT K1-GR-O2: "Sửa theo đọc code, KHÔNG chạy `test:flows`: kết quả flows chưa kiểm"; `seed:local`
  "chưa chạy thật (cấm)"; gate K1-GR-G chỉ chạy integration 9 file chạm.
- **Kịch bản:** luật mới làm hỏng mọi đường hoàn tất cấp `K1` không gửi checklist; nếu còn sót một chỗ, `dev:seed`/`seed:local` dừng
  (như R18 trước `32aeebbd`) và template `FlowWorld` hỏng ⟹ cả 5 flow nightly đỏ, trong khi `ci.yml` không chạy seed/flows nên CI vẫn xanh.
- **Kết quả quét tĩnh của reviewer (không còn chỗ sót):** quét mọi file có `/complete` hoặc `.complete(` trong `src/cli`, `test/flows`,
  `test/e2e`, `test/support`, `test/integration`, `test/http` ở `5b8ac15d`:
  - seed: một chỗ duy nhất `src/cli/seed/steps/request.steps.ts:287-308` (`completeGrant`) — đã gửi `grantChecklistBody(type, …)` theo
    `planTypeOf`; ba gói `K1` của fixture (`chatgpt-plus`, `cursor-pro`, `grammarly-pro`, `fixture/shared-demo-v4/catalog.ts:71/88/105`) đều
    nằm trong `applications` nên `planTypeOf` trả `K1`. Seed không hoàn tất `EXTEND` hay thu hồi `K1`.
  - flows: chỉ `mf5-rightsizing-edges.flow-spec.ts:43-47` hoàn tất cấp `K1` — đã gửi `k1Checklist('GRANT')`; `mf1-group-request` (nhóm = `K2`),
    `mf1-request-contract:224` (Cổng Nhân sự `K5`), `:324/328` (Figma `K2`) không cần.
  - e2e: `free-request` (`K5`), `paid-request-to-seat` (`h.subscription(10)` ⟹ mặc định `K2` của `seat-baseline-harness.ts:192`).
  - integration: file có `'K1'` mà không có `k1Checklist` đều không hoàn tất cấp trên gói `K1` (`year-start-commitments-kept` — ca `K1` không
    gọi `granted`; `year-start-commitments:297` — chỉ duyệt; `stock-summary:140`, `license-assignment-revocation:125` — ghế `K1` từ nhập
    baseline `h.seat`; `transfer-grace-regrant:213` — R-49 `K1` chỉ `grant`, không `complete`; `provisioning-grant-http:178` — chỉ kiểm `steps`).
    Các harness mặc định `K2` (`request-harness.ts:268`, `subscription-http-harness.ts:151`, `renewal-harness.ts:86`). `intakeBodyOf`
    (`test/support/application-body.ts:11`, mặc định `K1`) không được dùng bởi suite nào hoàn tất cấp.
- **Cách sửa:** sau commit cuối, chạy đủ các job `ci.yml` (kể cả `test:e2e`, serial) + `seed:local` (hoặc integration `seed*` + một lượt
  `dev:seed` trên DB local) + `test:flows`; ghi bảng kết quả vào HANDOFF. Nếu flows đỏ ở chỗ khác ngoài K1, tách sang vòng flows.

## Optional

### B2C-O1 — Mục "email công ty của chính người dùng" chỉ là lời tick; `chooseAccount` vẫn nhận địa chỉ công ty khác cho `K1` (K1-GR-O6)

- **Chỗ:** `src/modules/licensing/provisioning/provisioning.policy.ts:132-141`, gọi ở `tasks/provisioning-holder.service.ts:97-101`.
- **Kịch bản:** IT cấp `K1` cho `E1` với `accountIdentifier = e2@congty.vn` (email công việc của người khác, cùng tên miền) ⟹ được nhận;
  IT tick `COMPANY_EMAIL_REGISTERED` ⟹ hoàn tất 200. `FR-2.9`, `QĐ-111q`, `QĐ-103d`(1) và AC-7 ("gắn đúng `e1@congty.vn`", "gói `K1`
  đã gắn email của người khác không được gán cho `E1`") nói `K1` chỉ trên email công ty của chính người dùng.
- **Vì sao Optional, không Required:** hành vi có từ trước K1-GR, ngoài diff; `chooseAccount` cố ý cho alias của chính người đó
  (`provisioning.policy.spec.ts:118`, `E1.Alias@it.congty.vn`), hệ thống không biết alias thuộc ai. Nhưng xếp Nit như K1-GR-O6 là thấp.
- **Phương án (Owner chọn):** A — giữ (tick là lời IT, như QĐ "hệ thống không điều khiển Google/M365"); B — với `K1` bỏ qua
  `accountIdentifier`, luôn dùng `workEmail` (422 nếu gửi khác); C — với `K1` từ chối địa chỉ trùng `workEmail` của nhân viên khác
  (chặn đúng ca "dùng lại cho người khác" mà vẫn cho alias). Đề xuất C.
- **Test:** integration cấp `K1` với `accountIdentifier` = email của nhân viên khác ⟹ 422; alias lạ ⟹ 201.

### B2C-O2 — DB không buộc `variant = GRANT` ⟺ `kind = GRANT` (K1-GR-O5)

- **Chỗ:** `prisma/migrations/20261113004100_k1gr_grant_checklist/migration.sql:11-14`.
- **Kịch bản:** một ghi sai trong tương lai đặt checklist `GRANT` lên tác vụ `REVOKE` (hoặc `DEPARTURE` lên `GRANT`) vẫn qua CHECK; ranh giới chỉ
  do code giữ (`completedOf` lọc `kind = 'REVOKE'`, `mailboxLockedAmong` lọc `DEPARTURE`). Hôm nay chỉ hai đường ghi qua
  `ProvisioningK1ChecklistRepo.write`, đúng.
- **Cách sửa (migration sau, roll-forward):** thêm vế `("k1_checklist" IS NULL OR (("k1_checklist"->>'variant') = 'GRANT') = ("kind" = 'GRANT'))`.
- **Test:** `provisioning-revocation-constraints`: `UPDATE` checklist `GRANT` lên `REVOKE` ⟹ 23514 và ngược lại.

### B2C-O3 — Luật thứ tự cho checklist cấp không có trong QĐ-111az

- **Chỗ:** `provisioning-k1-checklist.policy.ts:178-190` (`judgeChecklist` dùng chung), `:249`.
- **Nhận xét:** QĐ-111az chỉ dùng "⟹" cho chuỗi thu hồi; vế cấp liệt kê hai điều kiện (mục 2 là điều *không* làm). SPEC §K1-GR lại ghi
  "`doneAt` đúng thứ tự" nên code khớp SPEC, không trái QĐ. Rủi ro UX: FE tick "không bật MFA" trước ⟹ 422 `OUT_OF_ORDER` cho một mục phủ định.
- **Phương án:** A — giữ (khớp SPEC, một hàm xét chung); B — với `GRANT` bỏ kiểm thứ tự (truyền cờ `ordered: false` vào `judgeChecklist`),
  bỏ mã `OUT_OF_ORDER` khỏi route cấp. Hỏi Owner; nếu giữ A, FE phải tick theo `order`.

### B2C-O4 — Nhãn mục 2 hẹp hơn chính sách khởi tạo

- **Chỗ:** `provisioning-k1-checklist.policy.ts:68` (`'Do not turn on multi-factor sign-in with a personal device'`).
- **Nhận xét:** đúng chữ QĐ-111az; `Bộ chính sách khởi tạo` §3/§11 rộng hơn: email/số điện thoại khôi phục và MFA chỉ dùng phương thức do công ty
  kiểm soát, không gắn số điện thoại, email hay app xác thực cá nhân. FE dịch theo `code` nên chỉ ảnh hưởng nhãn mặc định.
- **Cách sửa (tùy):** nhãn "Use only company-controlled recovery and multi-factor methods (no personal phone, email or authenticator app)";
  mã giữ nguyên.

### B2C-O5 — Thiếu ba ca integration cho vùng rủi ro

- **Chỗ:** `test/integration/licensing/provisioning-k1-grant-checklist.integration-spec.ts` (20 ca, tốt) chưa có:
  1. IT Admin `A2` (không phải người phụ trách mặc định `A1`) nhận và hoàn tất cấp `K1` kèm checklist ⟹ 200, audit có
     `defaultResponsibleEmployeeId = A1`, `completedBy = A2`, checklist lưu (US-07-02 AC-7).
  2. Tác vụ cấp `K1` có từ trước deploy: chèn bằng SQL hàng `GRANT` `IN_PROGRESS`, `k1_checklist` NULL ⟹ thẻ hiện mẫu `GRANT`; hoàn tất
     kèm checklist ⟹ 200 (D-61 (6) nói được nhưng chưa có test).
  3. Hai lần hoàn tất cùng lúc cùng một tác vụ `K1` (`Promise.all`) ⟹ đúng một 200, một 409, checklist ghi một lần.

## Nit

- **B2C-N1 — Mô tả `details` sai một chỗ.** `src/modules/licensing/README.md:233` và HANDOFF K1-GR.1 nói "hai mã đầu mang `details`", nhưng
  `refuseGrant('NOT_ALLOWED', expected)` ở `instantsOf` (mục lạ/trùng trên tác vụ `K1`) cũng mang `details`; chỉ gói khác `K1`/`EXTEND` không có.
  Ví dụ OpenAPI `GRANT_K1_CHECKLIST_NOT_ALLOWED` (`provisioning.http-errors.ts:262`) chỉ minh họa ca không `details`. Sửa chữ README (D-61 (3) đã đúng).
- **B2C-N2 — "không gửi ⟹ INCOMPLETE" chưa đủ.** README:231-233: không gửi checklist **và** không bằng chứng ⟹ `PROVISIONING_TASK.EVIDENCE_REQUIRED`
  (`tasks/provisioning.service.ts:127`, D-61 (5), có test). Ghi rõ trong README/tài liệu FE.
- **B2C-N3 — Thông điệp lỗi.** `provisioning.errors.ts:46` "The checklist of the grant is not valid" cũng dùng cho tác vụ `EXTEND`
  (`provisioning-grant-completion.service.ts:46`). Đổi thành "The checklist of the task is not valid".
- **B2C-N4 — Enum mã dùng chung hai tuyến (K1-GR-O4).** `provisioning.dto.ts:44` `z.enum(K1_CHECKLIST_CODES)` cho cả thu hồi và cấp: OpenAPI
  của body thu hồi liệt kê `COMPANY_EMAIL_REGISTERED`; gửi ⟹ 422 `REVOCATION.COMPLETION_NOT_ALLOWED`. Chấp nhận được.

## Phần đúng đã kiểm (bằng đọc code)

1. **Mục và thứ tự:** `CODES_OF.GRANT = ['COMPANY_EMAIL_REGISTERED', 'NO_PERSONAL_DEVICE_MFA']` (`policy.ts:89`) đúng hai ý QĐ-111az/AC-7/MF-1 bước 16;
   bằng chứng là ô riêng (AC-7 "tick đủ hai mục, đính bằng chứng"), không thêm mục `EVIDENCE_RECORDED` — D-61 (1) đúng.
2. **Chỉ áp `K1`, không áp kiểu khác:** `planK1GrantChecklist` trả `null` cho `K2/K3/K4/K5`, gửi checklist ⟹ `NOT_ALLOWED` không `details`
   (`policy.ts:243-246`); loại gói đọc trong tx (`sharedPool.provisioningTypeOf`), không tin client.
3. **`EXTEND`:** `writeExtension` (`provisioning-grant-completion.service.ts:40-50`) từ chối checklist, không ghi; `EXTEND` luôn có `request_id`
   (CHECK `provisioning_tasks_kind_request`, migration `20261110020200`) nên không lọt vào nhánh cấp; thẻ `EXTEND` = `null`
   (`provisioning-task-view.service.ts:198`, test `renewal-term-end`).
4. **Thu hồi không bị phá:** `planK1Checklist` giữ nguyên luật qua `judgeChecklist` + `refuseRevocation` (map `NOT_ALLOWED` ⟹ `COMPLETION_NOT_ALLOWED`,
   `INCOMPLETE/OUT_OF_ORDER` ⟹ `REVOCATION.K1_CHECKLIST_*`); `k1VariantOf` trả `Exclude<…, 'GRANT'>`; `cardsOf` chỉ tính "cuối của người" cho
   `REVOKE` (`service.ts:165`); `completedOf`/`liveRevocationsOf`/`openPersonalSeatsOf` vẫn lọc `kind = 'REVOKE'` nên checklist `GRANT` không lọt
   vào `mailboxLockedAmong` (P28/D-72); `departure-closure.policy.ts:35` chỉ đọc `DEPARTURE`.
5. **Một transaction, đúng thứ tự:** `frame.work` khóa tác vụ ⟹ `planGrant` (thuần, ném trước mọi ghi) ⟹ `record` ⟹ `markCompleted` (trigger
   `provisioning_task_guard` cấm sửa sau `COMPLETED`) ⟹ khóa/ngày cấp/`reportOutcome`/`recordAvoided` ⟹ audit, cùng tx; lỗi sau `record` cuộn lại
   cả checklist. Chỉ một đường hoàn tất cấp (`ProvisioningGrantCompletion.write`, `markCompleted` duy nhất ở `provisioning-task.repo.ts:186`).
6. **Gửi lại/idempotent:** lần hai sau `COMPLETED` ⟹ 409 ở `nextStatus` trước khi xét checklist; 422 không ghi gì (test kiểm `k1_checklist` NULL,
   `evidence` NULL, `IN_PROGRESS`).
7. **Dữ liệu cũ:** tác vụ `K1` đang mở trước deploy hiện mẫu chưa tick (tính lúc đọc), hoàn tất được khi gửi checklist; tác vụ `K1` đã
   `COMPLETED` trước đó có thẻ `null` (`k1ChecklistShown('COMPLETED', false)`).
8. **Bằng chứng:** lấy `k1Checklist.evidence` rồi `evidence` ngoài, trim, trống ⟹ `INCOMPLETE`; lưu một lần ở cột `evidence`; không có trường mật khẩu.
9. **Người thực hiện / nhận thay / audit:** không đổi `ProvisioningTaskFrame` (vai IT Admin, QĐ-77m, audit có `defaultResponsibleEmployeeId` và
   `completedBy`); checklist bất biến trên tác vụ sau `COMPLETED` (D-59), từng mục có `doneAt` — đủ "mục kèm người và thời điểm" (QĐ-77i).
10. **Kiến trúc:** thêm vào nhóm `k1-checklist/` có sẵn (9 file); `provisioning/` vẫn 25 file + 7 thư mục; `tasks/` 12 file; import chỉ trong
    capability `provisioning` và `../public/licensing.types`; không đọc bảng module khác; module card README cập nhật.
11. **Wire:** ba mã có trong `toProvisioningApiException` (`provisioning.http-errors.ts:186-194`), ví dụ OpenAPI sinh từ mapper, có trong
    `ROUTE_ERROR_CODES_LICENSING`; mô tả controller/OpenAPI mới không chứa "QĐ-" (grep diff `openapi.json` 0 dòng).
12. **Migration:** chỉ `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` nới (`REVOKE` ⟹ `REVOKE|GRANT`), không drop cột, không backfill, chạy lại an
    toàn, tương thích ngược với code cũ; mọi hàng có checklist hôm nay là `REVOKE` nên validate qua; tên `20261113004100` đứng sau migration cuối
    (`…004000`); không đụng enum DB (biến thể nằm trong JSON) nên không cần migration `_values`. Codec JSON nhận `GRANT`.
13. **Test không bị nới:** `provisioning-revocation-constraints` đổi kỳ vọng grant từ 23514 sang NULL đúng theo CHECK mới và thêm hai ca đỏ
    (`'[1]'` trên grant, checklist trên `EXTEND`); các spec sửa (`pool-grant-avoided-cost`, `provisioning-department-and-role`, `renewal-*`) chỉ thêm
    checklist hoặc thêm assertion, không bỏ `expect`, không `skip`.
14. **Seed:** `grantChecklistBody` thuần, có spec 9 ca; `doneAt` = now−2s, now−1s, tăng dần; gói khác `K1` trả `{}`.

## Mutation đề xuất (chạy rồi trả lại)

1. `provisioning-grant-completion.service.ts:73` bỏ `if (checklist) await this.checklists.record(…)` ⟹ ca "keeps the steps with the task" đỏ.
2. `tasks/provisioning.service.ts:127` luôn `cleanEvidence(input.evidence)` ⟹ ca "evidence only in the checklist" đỏ (EVIDENCE_REQUIRED).
3. `provisioning-k1-checklist.service.ts:169-172` bỏ nhánh `task.kind === 'GRANT'` (thẻ cấp rơi vào `k1VariantOf` ⟹ `STILL_EMPLOYED`) ⟹ ca thẻ
   "checklist GRANT with both steps" đỏ. (Bỏ `task.kind === 'REVOKE' &&` ở dòng 165 là đột biến tương đương — chỉ thêm một câu đọc — không cần giết.)
4. `request.steps.ts:273` `if (type !== 'K1')` ⟹ `if (type !== 'K2')` ⟹ `request.steps.spec` và integration `seed` (R18) đỏ.
5. `migration.sql:13` giữ `"kind" = 'REVOKE'` ⟹ integration `provisioning-revocation-constraints` và mọi hoàn tất cấp `K1` đỏ 23514.
