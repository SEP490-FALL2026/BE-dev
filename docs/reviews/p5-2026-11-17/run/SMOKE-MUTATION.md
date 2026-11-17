# Prompt 5: smoke API theo vai + mutation (17/11/2026)

**Skill đã đọc/dùng:** `superpowers:verification-before-completion` (verification: mỗi kết luận dưới đây có lệnh chạy và output đi kèm).
Process skill: không có skill riêng cho "smoke + mutation", nên dùng trình tự đỏ → hoàn nguyên → xanh của chính skill verification
(mục "Regression tests (TDD Red-Green)").

**Nơi chạy:** worktree `D:\FPT\FALL2026\Code\be-verify`, detached `d9d5d308` (`feat/p5`). Đã chạy `pnpm install --frozen-lockfile`,
`pnpm prisma:generate` và `pnpm build`. API chạy `node dist/main` ở cổng **3200** với env lấy từ `.env.seed.local`, đọc bằng chính
`parseSettings`/`validateLocalSettings` của `scripts/dev/seed-local.mjs`. Bỏ các khóa chỉ wrapper dùng (`SEED_*`) và đặt
`DOTENV_CONFIG_PATH`. DB `slm_smoke` @55432 (seed `shared-demo-v4`), Redis 6379.

**Giới hạn:**

- **Không chạy worker** (`dist/worker`). `.env.seed.local` trỏ SMTP thật (Resend) và R2 thật, nên chạy worker có thể gửi mail thật
  tới địa chỉ demo. Vì vậy không có email hay job nền nào chạy trong smoke.
- MinIO `wdp-minio` đã mất, nên **không kiểm được route upload/tải tệp do thiếu MinIO**. Không route nào trong smoke cần storage.
- `slm-p5-c` không có trong `docker ps -a` khi bắt đầu. Đã dựng bằng `make-test-db.sh slm-p5-c 35444` trong scratchpad (tmpfs,
  role `ci_integration`). Script này `rm -f` rồi tạo lại. Coordinator báo cũng đã dựng lại container này, nên bản đang chạy có thể là
  bản do script tạo, cùng cấu hình. Container vẫn để chạy.
- Thay đổi để lại trên DB demo: `AI_PROVIDER_MODE` đổi MODEL rồi về SIMULATED; `AI_ENABLED` và `AI_ACCESS_REQUEST_SUMMARY_ENABLED`
  đổi OFF → ON → OFF. Có audit và history cho các lần đổi; giá trị cuối giống ban đầu. Có thêm 1 lần gọi AI giả lập (invocation
  `f4d8a712…`) và các phiên đăng nhập. Không request ghi nào khác thành công.
- Mật khẩu đọc từ `.env.seed.local` và không in ra.

## A. Smoke API theo vai

**Kết quả: 0 lỗi 500/5xx.** Log API: 622 dòng, toàn bộ `info`, 0 `warn`/`error`.

| Vai (tài khoản) | Route | Status | Kết quả / field kiểm |
| --- | --- | --- | --- |
| IT Admin (NV-ITA1) | `GET /subscriptions` (`subscriptionList`) | 200 | Đạt. 13 thuê bao; `ownerDepartmentId` = null ở kho; `alerts` gói tháng `{baseDate: 2026-11-30, dates:[2026-11-23]}`; Figma năm `dates:[11-07, 11-30]`; K4 vĩnh viễn `{baseDate:null, dates:[]}` |
| IT Admin | `GET /subscription-renewals/adjustment?subscriptionId=` Jira K2 tháng | 200 | Đạt. `deadlineKind PAYMENT_DATE`, `adjustmentPointOn 2026-11-23` = 30/11 − 7, `seatsNeeded{total 7, heldPastRenewal 7, pendingContinuations 0, approvedAwaitingGrant 0}`, `target 7`, `suggestedChoice REDUCE` (mua 10), `canCancel false`, `callerIsResponsible true` |
| IT Admin | `… adjustment` Figma K2 năm | 200 | Đạt. `NOTICE_DEADLINE 2026-12-07`, `adjustmentPointOn 2026-11-07` (−30), `redAlertOn 2026-11-30` (−7), `renewalOn 2027-01-06`, `target 11` < 18, `REDUCE`, `callerIsResponsible false` (NV-ITA2 phụ trách) |
| IT Admin | `… adjustment` 1Password K2 (kho hết ghế) | 200 | Đạt. `target 3` = mua 3, `RENEW`, `openRequests 1` (R15) |
| IT Admin | `… adjustment` ChatGPT K1 | 409 | Đúng tài liệu: `SUBSCRIPTION_RENEWAL.NOT_RENEWABLE` `details.reason NOT_POOL_TERM` |
| IT Admin | `… adjustment` JetBrains K4 | 409 | Đúng tài liệu: `NOT_RENEWABLE` `reason PERPETUAL` |
| IT Admin | `… adjustment` id lạ | 404 | Đúng tài liệu: `SUBSCRIPTION_RENEWAL.NOT_FOUND` |
| IT Admin | `GET /device-stop-requests` (mặc định OPEN; và `state=COMPLETED`) | 200 / 200 | Đạt. Cả hai trang rỗng vì seed không có máy đăng ký |
| IT Admin | `GET /notifications` `Accept-Language: vi` / `en` | 200 / 200 | Đạt. 17 thông báo, `title`/`message` đều có chữ; `subject.type` 17/17 UPPER_SNAKE; `target.operationId` đều là operation GET có trong `openapi.json` |
| IT Admin | Mở 15 `target` khác nhau | 15 × 200 | Đạt (`policyGet`, `purchaseInvoiceGet`, `ghostSeatRecommendationGet`, `usageSourceList`, `vendorAccountDiscrepancyList`, `offboardingCaseGet`, `saasIssueGet`, `departmentSoftwareProposalList`) |
| Trưởng phòng (NV-ENGH) | `GET /notifications` vi / en | 200 / 200 | Đạt. 11 thông báo, có chữ, `subject.type` UPPER_SNAKE |
| Trưởng phòng | Mở 10 `target` khác nhau | 4 × 200, **6 × 403** | **Lỗi F1**: `budgetCycleGet` ×2, `budgetVersionGet` ×2, `departmentTransferGet`, `offboardingCaseGet` → 403 `AUTHORIZATION.FORBIDDEN` |
| Trưởng phòng | `GET /need-decisions` (`needDecisionList`) | 200 | Đạt. 1 mục (R03) |
| Trưởng phòng | `GET /ai/access-request-summaries/source`, `POST /ai/access-request-summaries` (AI tắt) | 403 / 403 | Đúng OpenAPI: `AI.DISABLED`, không phải 503. 503 `AI.PROVIDER_UNAVAILABLE` chỉ có ở chế độ MODEL |
| Trưởng phòng | Bật AI tạm (SIMULATED): `source`, `create`, `get`, `create` với revision cũ | 200 / 202 / 200 / 409 | Đạt. `simulated: true`, `status COMPLETED`, có 1 dòng tóm tắt R03; revision cũ → `AI.SOURCE_STALE`. Sau đó trả công tắc về OFF |
| Người duyệt chi (NV-CEO) | `GET /notifications` vi / en | 200 / 200 | Đạt. 23 thông báo: 13 `SPEND_BATCH_SUBMITTED` (13 lô khác nhau, mỗi lô 1 thông báo), 10 `BUDGET_VERSION_AWAITING_DECISION` |
| Người duyệt chi | Mở 23 `target` (`spendBatchGet`, `budgetVersionGet`) | 23 × 200 | Đạt, không có 403 |
| Finance (NV-FIN1) | `POST /budget-adjustments`, `amount.amount = "-5000"` | 422 | Đúng mã `MONEY_OUT_OF_RANGE`; `details.path = "amount"` (xem F2) |
| Finance | `… amount.amount = "abc"` | 422 | Đạt. `VALIDATION_ERROR`, `issues[0].path = "amount.amount"` |
| Finance | `… amount.amount = "1.5"` | 422 | Đúng mã `MONEY_SCALE_EXCEEDED` `allowedDecimals 0`; `details.path = "amount"` (F2) |
| Finance | `… amount = -5` (số, không phải object) | 422 | Đạt. `VALIDATION_ERROR` `path "amount"` (`invalid_type`) |
| Finance | `… amount.amount = "0"` | 409 | `BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED`: hạn nộp 2026 = hôm nay, nên kiểm kỳ trước khi kiểm `> 0` (ghi chú I3) |
| Finance | `GET /notifications` vi / en; mở 24 `target` | 200 / 200; 24 × 200 | Đạt |
| Super Admin | `GET /operating-parameters` | 200 | Đạt. **30 khóa**, có `AI_PROVIDER_MODE` (`SIMULATED`, enum `SIMULATED/MODEL` + `optionLabels`). 3 khóa bị bỏ không còn; 3 khóa mới có giá trị 7/30/7 |
| Super Admin | `PUT /operating-parameters/AI_PROVIDER_MODE` `MODEL` → `SIMULATED`; `BOGUS` | 200 / 200 / 422 | Đạt. `BOGUS` → `PARAMETER.VALUE_INVALID` `OUT_OF_RANGE` |
| Super Admin | `GET /operating-parameters/AI_PROVIDER_MODE/history`, `GET /audit-events` | 200 / 200 | Đạt. History có 2 khoảng (MODEL rồi SIMULATED); audit có 2 `PARAMETER.CHANGED` `resourceId AI_PROVIDER_MODE` với `value` MODEL, SIMULATED |
| Super Admin | `GET /notifications` vi / en; mở 4 `target` | 200 / 200; 4 × 200 | Đạt |
| Employee (20 tài khoản) | `GET /me/devices` | 20 × 200 | **Không có dữ liệu**: không ai có máy đăng ký. Đây là khoảng trống của seed, không phải lỗi. Không tạo được yêu cầu dừng thật |
| Employee (NV-DEV1) | `POST /me/device-registrations/{id lạ}/stop-requests` | 404 | Đúng tài liệu: `DEVICE_REGISTRATION.NOT_FOUND` |
| Employee (NV-DEV1, NV-DEV2, NV-DES1) | `GET /notifications` vi / en | 200 | Đạt. `USAGE_TRACKING_NOTICE` có chữ, `target = null` đúng chủ ý |
| (NV-OFF1) | `POST /auth/login` | 401 | Đúng: người nghỉ việc bị chặn từ hôm nay |

**Tổng:** 32 dòng kiểm (114 lời gọi HTTP, kể cả mở target). 30 dòng đạt hoặc đúng tài liệu. 2 dòng có lỗi:

- target của trưởng phòng (F1);
- `details.path` của lỗi tiền chỉ đúng một phần (F2).

Lỗi 5xx: 0.

## B. Mutation

Test integration chạy với `TEST_DATABASE_ADMIN_URL=…@127.0.0.1:35444/postgres` và `--maxWorkers=1`. Mỗi mutation được hoàn nguyên bằng
`git checkout -- <file>` rồi chạy lại cùng lệnh test.

| # | Chỗ | Mutation | Test chạy | Khi có mutation | Sau hoàn nguyên |
| --- | --- | --- | --- | --- | --- |
| 1a | `src/modules/licensing/subscription-renewal/seats-needed/renewal-seats-needed.policy.ts` `seatsNeededOf` | Bỏ `+ parts.approvedAwaitingGrant` | `jest src/modules/licensing/subscription-renewal/seats-needed` | **Đỏ** 3/24 (policy `seatsNeededOf`, `cancelProblem`; service) | Xanh 24/24 |
| 1b | `src/modules/licensing/subscription-renewal/subscription-renewal-seat.repo.ts:105` | `last_day <= renewalOn` → `<` (ghế kết thúc đúng ngày gia hạn) | `test/integration/licensing/subscription-renewal-seats-needed.integration-spec.ts` | **Đỏ** 1/7 | Xanh 7/7 |
| 2a | `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts:201` `monthly()` | `addDays(input.startDate, 1)` → `input.startDate` | `jest src/modules/catalog/subscription/obligation` | **Đỏ** 2/64 (V-1, gói bắt đầu hôm nay) | Xanh 64/64 |
| 2b | `src/modules/operating-parameters/parameter-definitions.policy.ts` `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL.default` | 30 → 29 (policy nhận số ngày qua `windows`, nên hằng 30 nằm ở đây) | `jest src/modules/operating-parameters src/modules/catalog/subscription` | **Đỏ** 1/245 (S20-T9b) | Xanh 245/245 |
| 3 | `src/modules/requests/spend-submission/spend-batch-recorder.service.ts:57` | `eventKey` thêm `:${randomUUID()}` (mất idempotent) | Unit `src/modules/requests/spend-submission` + `src/modules/notifications/inbox`; integration `test/integration/requests/spend-batch-notifications.integration-spec.ts` | Unit **xanh** 763/763; integration **đỏ** 1/7 | Integration xanh 7/7 |
| 4a | `src/modules/notifications/inbox/notification-text/inbox-notification-text.policy.ts` `groupShows` | Nhóm `[ ]` luôn hiện | `jest src/modules/notifications` | **Đỏ** 28/766 | Xanh 766/766 |
| 4b | Cùng file, `hasGroupValue` | Bỏ `value !== 0 &&` (số 0 làm nhóm hiện) | `jest src/modules/notifications` | **Đỏ** 5/766 | Xanh 766/766 |

**Không mutation nào lọt.** Mutation 3 có điểm yếu:

- Nó chỉ bị bắt nhờ test integration so khớp nguyên chuỗi `event_key: SPEND_BATCH_SUBMITTED:${batch.id}`. Unit test không bắt được.
- Không có test hành vi nào gọi lại (replay) `submitted()` hai lần cho cùng một lô rồi kiểm vẫn chỉ có một thông báo.
- Đề xuất: thêm test integration gọi `SpendBatchRecorder.submitted` hai lần, hoặc chạy lại projection, cho cùng một lô, rồi kiểm
  `toHaveLength(1)`. Test này giữ đúng nghĩa "một lần", kể cả khi chuỗi khóa đổi định dạng.

`git -C D:/FPT/FALL2026/Code/be-verify status` sau khi xong: `nothing to commit, working tree clean`. Chỉ còn file ignored:
`.env.seed.local`, `dist/`, `node_modules/`, `reports/`, `src/generated/`.

## Lỗi tìm được

| # | Mức | Lỗi | Bằng chứng | Gợi ý |
| --- | --- | --- | --- | --- |
| F1 | **Medium** | `target` của thông báo không phân theo vai người nhận. Trưởng phòng mở target của `BUDGET_CYCLE_OPENED` (`budgetCycleGet`), `BUDGET_VERSION_DECIDED` (`budgetVersionGet`) và `PERSONNEL_EVENT_RECORDED` (`departmentTransferGet`, `offboardingCaseGet`) đều nhận **403**: các route này chỉ cho Finance/Người duyệt chi, hoặc Super Admin/IT Admin. Catalog `notifications.md` và tài liệu FE vẫn ghi đó là "route đọc nên mở". Mục "việc BE còn mở" chỉ nhắc `STEP_ASSIGNED`/`STEP_SLA_REMINDER`, không nhắc các mã này. Rất có thể nhân viên nhận `PERSONNEL_EVENT_RECORDED` về chính mình cũng gặp 403 (chưa kiểm được vì seed không có dòng nào) | NV-ENGH: 6/10 target ra 403 | Phân nhánh trong `src/modules/notifications/inbox/notification-target.policy.ts` (`TARGET_BY_CODE` theo `audience`/vai). Ví dụ: trưởng phòng → `budgetMine`/`budgetMineVersionList`, `budgetCyclePackage`; người được điều chuyển → `meDepartmentTransferGet`; hoặc trả `null`. Cập nhật catalog |
| F2 | Low | `details.path` của lỗi tiền không nhất quán trên route nhận object tiền. Ở `budgetAdjustmentCreate`, `MONEY_OUT_OF_RANGE`/`MONEY_SCALE_EXCEEDED` trả `path "amount"`, còn `VALIDATION_ERROR` của cùng field trả `"amount.amount"`. Tài liệu FE (mục e) nói route nhận object tiền dùng `<path>.amount`; `budget-review` dùng `knownNeedsToYearEnd.amount`. FE gắn lỗi theo `path` sẽ lệch ô | `src/modules/budgets/adjustment/budget-adjustment.http-errors.ts:113` (`MoneyOutOfRangeError('amount')`) và nơi ném lỗi trong service | Thống nhất `amount.amount`, hoặc ghi rõ ngoại lệ trong tài liệu FE |
| F3 | Low | Câu EN lặp từ: "…for your purchase invoice **for for** a subscription…" | `notification-texts-licensing.types.ts:267` (`invoice for {linkKind:enum}`) + nhãn `linkKind.SUBSCRIPTION.en = 'for a subscription'` (`notification-labels.types.ts:45`) | Bỏ "for" trong template EN |
| F4 | Low | Câu EN sai mạo từ: "has **a under-used** light" | `notification-texts-budget.types.ts:282` + nhãn `UNDER.en = 'under-used'` | Đổi câu, ví dụ "is marked {light:enum}" |
| F5 | Info | Dấu chấm đôi khi `reason` đã có dấu chấm: "…cho Marketing.." (`DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED`). Các template `Lý do: {reason}.` khác cũng vậy | Inbox NV-ENGH | Cắt dấu câu cuối của `reason` khi render |
| F6 | Info | `alerts.dates` vẫn có ngày ở thuê bao K1 có phòng sở hữu (ChatGPT, Cursor, Grammarly), trong khi `subscriptionRenewalAdjustmentGet` trả `NOT_POOL_TERM` và tài liệu nói K1 "thôi nhận cảnh báo". FE có thể hiện cảnh báo mà không mở được form điều chỉnh | `subscriptionList` (IT Admin) | Trả `{baseDate:null, dates:[]}` cho thuê bao không có điểm điều chỉnh, hoặc ghi rõ trong tài liệu |
| F7 | Info | Message của `SUBSCRIPTION_RENEWAL.NOT_RENEWABLE` liệt kê 5 `reason`, tài liệu FE liệt kê 6 (thiếu `CANCELLED`) | Response 409 | Sửa câu message |
| I3 | Info | `amount "0"` ở `budgetAdjustmentCreate` qua được bước validate và ra 409 `CYCLE_NOT_LOCKED` trước khi kiểm "above nothing". Không sai, chỉ khác thứ tự lỗi FE có thể thấy | Response 409 | Không bắt buộc sửa |

Không lỗi nào ở trên là 500. Lưu ý vận hành: `.env.seed.local` chứa thông tin SMTP/R2 thật. Chạy `seed:local` (wrapper có khởi động worker)
sẽ đẩy outbox qua SMTP thật. Địa chỉ demo là `.example` nên mail sẽ bị trả về, nhưng vẫn tốn quota của SMTP.
