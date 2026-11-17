# REVIEW-SPEC-2 — Review 2 cho SPEC/PLAN mở rộng seed `shared-demo-v4` (17/11/2026)

Reviewer độc lập lượt 2. Chỉ đọc code; không chạy pnpm, docker hay test; không sửa code. Mọi `file:dòng` tính từ gốc repo BE, trừ
khi ghi khác.

Nhánh `feat/p5` đi tiếp **trong lúc review**: lúc bắt đầu ở `d19bbbdd`, lúc kết thúc ở `0f086c61` (thêm F1–F5, T1 của prompt 5).
Kiểm bằng `git diff d3757876 HEAD --stat`:

- `src/cli/seed/**`, `test/flows/**`, `test/support/flows/**` không đổi so với `d3757876`.
- `openapi.json` chỉ thêm `CANCELLED` vào chữ ví dụ `SUBSCRIPTION_RENEWAL.NOT_RENEWABLE`.
- F5 (`65375780`) bỏ ngày cảnh báo gia hạn của thuê bao không có điểm điều chỉnh. CP1 kiểm lại cảnh báo của `claude-team`.

## Skill đã dùng

| Skill | Vai trò | Dùng để |
| --- | --- | --- |
| `agent-skills:spec-driven-development` | process | Soát spec theo mục tiêu, tiêu chí xong, ranh giới, thứ tự task |
| `superpowers:verification-before-completion` | verification | Mỗi finding mới và mỗi "Đạt" có bằng chứng đọc trực tiếp từ code hoặc `openapi.json` |
| (review) | — | Không có skill review riêng được đọc ở lượt này. Thay bằng đọc trực tiếp seed, module nguồn, flows và `openapi.json` |

Không dùng agent phụ. Những chỗ chưa tự kiểm lại được ghi rõ "chưa kiểm lại" ở bảng dưới.

## Tổng hợp

| Mức | Finding cũ (Review 1) | Đạt sau Review 2 | Finding mới (Review 2) | Đã sửa thẳng vào SPEC/PLAN |
| --- | --- | --- | --- | --- |
| Critical | 13 | 13 (C-11 đóng bằng Q-B) | 3 (N-1…N-3) | 3 |
| Required | 22 | 22 (R-7 ở PLAN mới sửa ở lượt này) | 15 (N-4…N-18) | 15 |
| Optional | 8 | 7 (O-6 chưa vào README) | 4 (N-19…N-22) | 1 (N-19); còn lại chỉ ghi nhận |

**Kết luận:** sau các sửa ở lượt này, không còn Critical/Required mở. Spec sẵn sàng giao chat Sonnet, với ba điều kiện:

- T9b (ngân sách trước Request) và T16b (`D0+1`) là bắt buộc, không được cắt.
- CP2 và CP5 phải chạy thử `D0+1`.
- CP6 hiệu chỉnh hằng số của `baseFor` nếu đèn lệch.

## 1. Finding cũ (Review 1)

### Critical

| # | Kết quả | Bằng chứng / ghi chú |
| --- | --- | --- |
| C-1 tài khoản khóa | Đạt | `src/modules/identity-access/public/local-demo-account.api.ts:45-56` (chỉ `ACTIVE` + `ACTIVATED` mới `present`); `src/cli/seed/steps/organization.steps.ts:144-160` (`accounts()`). SPEC S03 và PLAN T3 đúng. Ghi chú N-21 |
| C-2 R57 đọc bằng người bị chặn | Đạt | `src/cli/seed/steps/request.steps.ts:40-63`: tìm qua Audit bằng Super Admin, nhưng đọc chi tiết bằng **người gửi** (`:52-55`). Chặn không đổi trạng thái tài khoản, chỉ chặn đăng nhập (`identity-access/accounts/account.policy.ts:15-21`). `readAs` là cách sửa đúng |
| C-3 chuỗi `AWAITING_IT_CLOSE` | Đạt (chưa kiểm lại) | Chấp nhận theo Review 1 (`grant-cancellation.policy.ts:52-60`) |
| C-4 chuyển trạng thái báo lỗi | Đạt | `src/modules/licensing/saas-issue/saas-issue.policy.ts:80-88`: `NEW → IN_PROGRESS/DUPLICATE`, `RESOLVED → IN_PROGRESS/CLOSED`. Xem thêm N-16 |
| C-5 mã cửa sổ quota | Đạt (chưa kiểm lại) | Chấp nhận theo Review 1 (`tool-status.policy.ts:11-15`) |
| C-6 máy đã dừng | Đạt | `src/modules/usage/intake-gate/intake-gate.http-errors.ts:30` (403 `DEVICE.COLLECTION_STOPPED`). Cửa sổ nhận tính từ lúc **xác nhận đăng ký**, không theo credential (`devices/**/credential-session.policy.ts:25-35`), nên enroll lại ở `D0+1` vẫn gửi được ngày `D0` |
| C-7 `outcomeNote`, `suggestedChoice` | Đạt | `licensing/subscription-renewal/subscription-renewal.dto.ts:77-85`; `seats-needed/renewal-seats-needed.policy.ts:29` |
| C-8 `oneSubscription` | Đạt | `src/cli/seed/steps/catalog.steps.ts:271-292`: `rows[0]`; `status === 'ACTIVE'` ⟹ `present`. Trạng thái thuê bao chỉ có `DRAFT`/`ACTIVE` (`catalog/subscription/pool/subscription-pool.policy.ts:134`), nên zoom-business (ngày gia hạn đã qua) không làm lượt chạy lại PATCH |
| C-9 thân `POST /devices` | Đạt một phần | Thân đúng. Route đổi người giữ/ngừng sai gốc ⟹ N-6 |
| C-10 nộp lại hóa đơn | Đạt | `requests/purchase-invoice/purchase-invoice-submission.service.ts:51-54`: chỉ người nộp gốc; bản gốc phải `RETURNED`; nộp lần hai ra `ALREADY_RESUBMITTED` |
| C-11 ghế K2 ở MKT | **Đóng bằng Q-B** | Review 2 áp vào S01, S08, S12, S13, S14, S16, S18 và §4.2 |
| C-12 `GRANT` cho dòng bị từ chối | Đạt | `request.steps.ts:237-246` lặp mọi `beneficiaries` |
| C-13 idempotent hoàn trả | Đạt | `openapi.json` `GET /return-requests` có `state`, `assignmentId` |

### Required

| # | Kết quả | Ghi chú |
| --- | --- | --- |
| R-1, R-2, R-4, R-5, R-6, R-8, R-9, R-12, R-13, R-14, R-16, R-17, R-18 | Đạt (chưa kiểm lại) | Đã có trong SPEC với nhãn "Review 1" |
| R-3 | Đạt | `saas-issue-view.service.ts:89`: mặc định `assigned` với IT Admin |
| R-7 | Đạt ở lượt này | SPEC đã sửa thành ENGH ≥ 1, nhưng PLAN CP2 còn "ENGH ≥ 2". Đã sửa (N-18) |
| R-10 | Đạt | `GET /app-users` có `status`, `activationState`, không có lọc theo nhân viên (`openapi.json`) |
| R-11 | Đạt | `data-import/employee-import/employee-import-audit.mapper.ts:37-43`: `fileName` nằm trong `after` của sự kiện Audit. SPEC nên đọc `after.fileName` |
| R-15 | Đạt | `devices/stop-request/stop-request.dto.ts:12-13` (mặc định `OPEN`) |
| R-19, R-20 | Đạt | PLAN T20, §7, CP4 |
| R-21 tệp thật | Đạt sau Q-D/Q-E | Review 2 áp: SPEC S23 mục 2, 3, 4a; PLAN T1b. Xem N-7, N-10 |
| R-22 báo cáo | Đạt sau Q-C | Review 2 áp: SPEC S24 viết lại; PLAN T9b, T29. Xem N-2…N-4, N-11…N-14 |

### Optional

| # | Kết quả |
| --- | --- |
| O-1, O-2, O-3, O-4, O-7 | Đạt (đã có trong SPEC/PLAN) |
| O-5 | Đạt (S02 ghi bản xem trước hết hạn sau 24 giờ) |
| O-6 | Chưa: "mail mời vào outbox" chưa có trong T26/§9. Không chặn |
| O-8 | Đạt (T28). Review 2 thêm `--binary` (N-8) |

## 2. Finding mới (Review 2)

### Critical

**N-1 · `--continue` ở `D0+1` ra exit 4 ngay từ `org.employees` (lỗi có sẵn, spec chưa thấy).**

- `placedAsWanted` (`src/cli/seed/steps/organization.steps.ts:107-125`) đọc `GET /departments/{id}/employees`.
- Route này chỉ trả placement còn hiệu lực **hôm nay** (`organization/department/department.repo.ts:489-515`).
- Điều chuyển NV-DEV4 hiệu lực `D0+1` (`fixture/shared-demo-v4/usage.ts:125`). Nó đóng placement ENG và mở placement ITO
  (`personnel/transfer/transfer-change-writer.service.ts:30-33`).
- Hệ quả ở `D0+1`: DEV4 không còn trong ENG, `org.employees` ra `conflict`. `org.accounts` cần nó nên `blocked`, kéo theo gần như mọi
  bước, exit 4. DEMO-14 và ngày usage AI thứ hai, hai thứ `--continue` sinh ra để ghi, không bao giờ được ghi.
- NV-OFF1 (có sẵn) và NV-DEV7 (mới) nghỉ `BLOCK_NOW` với ngày cuối là `D0`, có cùng rủi ro khi placement kết thúc.
- Sửa: SPEC §4.1 mục 3 (người có sự kiện fixture kiểm bằng `GET /employees/{id}`); PLAN T16b mới; CP2 chạy thử `D0+1`.

**N-2 · Đề xuất "ENG `GREEN`" của S24 làm DEMO-14 ở `D0+1` bị từ chối.**

- `demo.budget-adjustments` chuyển 5 tr từ ENG sang BOD (`src/cli/seed/steps/demo.steps.ts:234-245`).
- Sàn của nguồn chuyển là dự kiến cuối năm. Dưới sàn thì API trả 422 `BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR`
  (`budgets/adjustment/budget-adjustment.controller.ts:88`; `budgets/review/budget-review-figures.service.ts:51-52`, `R-40`).
- Với đèn `GREEN`, cơ sở chỉ hơn dự kiến khoảng 20 %. Bước ra `conflict`, exit 4; `mf4-budget` cũng mất chỗ trống.
- Sửa: ENG `UNDER`, cơ sở `max(600 tr, ⌈F/0,5⌉)`; đèn `GREEN` chuyển sang BOD (SPEC S24 mục 1).

**N-3 · Ngân sách cơ sở làm ở T29 (sau T25), quá muộn cho Request ở T12.**

- Sau Q-B, BOD giữ khoảng 11 tr/tháng ghế K2: 4 ghế Adobe khoảng 1,83 tr; Zoom, Notion, M365, Photoshop.
- Ghế-tháng tính từ `granted_on` của baseline (`licensing/assignment/assignment.policy.ts:40`, `core/seat-month-cost.ts:61-72`).
- Wrapper bật worker trong lúc seed (`docs/guides/seed.md:74`), nên job `seat-month` có thể đã tính các tháng đã hết.
- Cơ sở cũ BOD 50 tr. Duyệt chi R47/R49 kiểm lại ngân sách (`requests/spend-approval/spend-decision.service.ts:101`), có thể bị chặn
  ở CP2. ITO cũng có nguy cơ khi rải ngày cấp tới 300 ngày.
- Sửa: PLAN T9b mới (sau T9, trước CP1); T29 chỉ còn chốt tháng, ký quý, hóa đơn tháng trước và script.

### Required

| # | Chỗ | Finding | Bằng chứng | Đã sửa |
| --- | --- | --- | --- | --- |
| N-4 | S24 mục 1, 4 | Câu "đèn không phụ thuộc ngày seed" sai. Nhịp chi = `spent·12/(base·M)`; `UNDER` chỉ khi `M ≥ 6`; chốt tới `min(10, tháng−1)`. Tỷ lệ cũ (GREEN 0,85) ra `YELLOW` khi `M ≤ 9`. `YELLOW` với dự phòng 10 % chỉ có cửa sổ khoảng 2 % | `budgets/review/budget-review.policy.ts:83-112`; `src/cli/seed/steps/demo.steps.ts:153` | Bảng đích mới: ENG/ITO `UNDER`, BOD `GREEN` theo `g(M)`, FIN `YELLOW` với dự phòng 60 %, DES/SAL `RED`. Đủ 4 đèn chỉ bảo đảm khi `D0` từ 01/10 tới 31/12; ngoài khoảng đó ghi `detail`, không `conflict` |
| N-5 | S10b R42, R55 | FIN cố ý vượt cơ sở, nên kiểm ngân sách có thể ra `RESERVE_CONFIRMATION`. Không có `confirmReserve` thì `nextScenarioAction` trả `null`, bước ra `conflict` | `src/cli/seed/steps/scenario-path.ts:69-72` | Thêm `confirmReserve: true` (SPEC S10b, PLAN T12) |
| N-6 | S16 | `holder-changes`, `retirements` nằm ở `/devices/{id}/…` (id máy), không ở đăng ký. Bản ký, mã đăng ký, xác nhận, yêu cầu dừng dùng `registrationId` | `openapi.json` paths `/api/v1/devices/{id}/holder-changes`, `/retirements`; `DeviceDetailResponseDto.registrationId` | SPEC S16, PLAN T20 |
| N-7 | S23 (Q-D) | Thiếu ba ý: (1) `pdf-lib` cần `@pdf-lib/fontkit` để nhúng TTF; (2) font phải tới `dist`, mà `nest-cli.json` không có `assets` và image chỉ chép `dist`; (3) test "chứa số trong bytes" không làm được vì chữ của font nhúng là mã glyph | `nest-cli.json`; `Dockerfile:14,41`; `package.json:85` | SPEC S23 mục 4a, 6; §11 ngoại lệ (`package.json`, `pnpm-lock.yaml`, `nest-cli.json`, `src/cli/seed/assets/fonts/**`); PLAN T1b |
| N-8 | T28 | Patch không mang tệp font (cần `--binary`) và thiếu `package.json`, `pnpm-lock.yaml`, `nest-cli.json` | — | PLAN T28 |
| N-9 | T0 | "`git log -1` = `d3757876`" đã sai: HEAD đi tiếp tới `0f086c61` trong lúc review, và nhánh còn có người commit song song | `git log d3757876..HEAD` | PLAN §0.4, T0: ghi HEAD thật, kiểm phần seed/flows không đổi; `git status` sạch trước khi tạo nhánh |
| N-10 | S23 (Q-E) | BM-10 không có ô cơ sở/dự phòng; cần định nghĩa số. `p` không được đoán 10 | `policies/import-template/import-template.service.ts:71-137`; `budgets/budget/budget-facts.service.ts:117-119` (`BUDGET_RESERVE_DEFAULT_PERCENT`) | SPEC S23 mục 2–3: ba dòng đề xuất dưới ô tổng; tệp Finance ba cột đề xuất/đã chốt/chênh lệch, đọc từ `GET /budget-versions/{id}`; script G |
| N-11 | S24 mục 3 | Chỉ ENG có Request K1/K4 nhận hóa đơn (R18, R19, R56). Hóa đơn gắn thuê bao K2 không tính cho phòng | `src/cli/seed/fixture/shared-demo-v4/requests.ts`; `budgets/budget/invoice.policy.ts:90-103` | `SV-INV-011` (R18), `SV-INV-012` (R56); BOD/FIN/ITO có xu hướng nhờ ghế-tháng |
| N-12 | S08 | Rải ngày cấp tới 300 ngày rơi trước `startDate` của m365-standard (`D0−245`), confluence-premium (`D0−295`), claude-team (`D0−200`) | `src/cli/seed/steps/catalog.steps.ts:224-236` | Kẹp `max(D0−n, startDate, hireDate)` (SPEC S08, PLAN T8) |
| N-13 | S24 mục 5 | Ký lần hai ra 409 (`BudgetReviewSignedError`). `explainOne` coi "có một dòng `EXPLAINED`" là xong, nên không đạt được "≥ 2 phòng" | `budgets/review/budget-review-signature.service.ts:41-42`; `src/cli/seed/steps/demo.steps.ts:185` | Ký mọi kỳ quý khác `SIGNED` trừ kỳ quý mới nhất; đủ 2 `EXPLAINED` mới `present` |
| N-14 | S24 script A | `remaining = total − used` sai từ `D0+1`: API tính trên cơ sở hiệu lực (có điều chỉnh) | `budgets/budget-view/budget-view.mapper.ts:27-55` | Dùng `effectiveBudget.total` |
| N-15 | S20 | SV-INV-010 SL 6, nhưng số mua confluence-standard là 7 (3 ghế nền + 4 Trống) | `catalog.steps.ts:211-213` | Sửa thành 7 |
| N-16 | S12 | Sweep đóng ISSUE3 `RESOLVED → CLOSED`; lượt sau phải coi là đã tới đích. Bản trùng của ISSUE5 cần thẻ riêng để tìm lại | `saas-issue.policy.ts:85` | SPEC S12, PLAN T14 |
| N-17 | S06 | `lastReviewedOn = D0−400` đổi theo ngày. Nếu so từng trường thì lượt `D0+1` ghi đè | `openapi.json` `PlanTermsResponseDto` | `present` khi `data.terms ≠ null` |
| N-18 | PLAN CP2 | Còn "ENGH ≥ 2", trái R-7 | — | Sửa thành ≥ 1 |

### Optional

| # | Finding | Xử lý |
| --- | --- | --- |
| N-19 | Câu "dự kiến gần như không đổi giữa các kỳ chốt" chỉ đúng khi job `seat-month` đã chạy. Chốt tháng `m` chỉ tính lại tháng `m` (`budget-review-snapshot.service.ts:56,80`); flows tắt job | Đã sửa bảng S24 |
| N-20 | SEED-AUDIT ghi "NL-1: seat-tháng chỉ tính từ ngày seed". Sai với ghế nền có `granted_on`: hiệu lực từ ngày cấp thật (`assignment.policy.ts:40`, `core/seat-month-cost.ts:61-72`) | Chỉ ghi nhận. Điều này khẳng định C-11 và cách tạo xu hướng của S24 |
| N-21 | Sau khi sửa C-1, `ctx.ids.appUsers` không có NV-BOD3. Hiện không bước nào cần. Nếu cần thì lấy id từ danh sách `LOCKED` | Ghi nhận |
| N-22 | DEMO-14 bổ sung 5 tr cho ITO "gia hạn 1Password" trong khi ITO ở đèn `UNDER`: hợp lệ, chỉ hơi lạ về nghĩa | Ghi nhận |

## 3. Áp Q-B…Q-E

| Quyết định | Áp vào SPEC | Áp vào PLAN |
| --- | --- | --- |
| Q-B: Adobe/Zoom ở BOD | §2; §4.2 (bỏ MKTH khỏi ngoại lệ); S01 (NV-MKT3/4/5 → NV-BOD4/5/6, số người giữ nguyên 17); S08 (Adobe: DEP, BOD4, BOD5, BOD6; Zoom: BOD4); S12 ISSUE5; S13 NOTICE3 (NV-DEP → NV-BOD5); S14 (nguồn Adobe, hàng chờ NV-DEP ≥ 3); S16 SV-LT-004; S18; §6; §8 | T8, T14, T15, T17, CP3, T20, T22 |
| Q-C: ngân sách theo ngày seed, 4 đèn, xu hướng | §2; S08 (ngày cấp); S10b; S24 mục 1–6 viết lại (N-2, N-4, N-11, N-13, N-14); §6; §7; §8 | T9b mới; T29 thu gọn; CP6 |
| Q-C: tỷ lệ seat Trống | Bảng S24 và script E: nợ prompt 4b, chỉ in, không nghiệm thu; §8 | CP6 |
| Q-D: `pdf-lib` + Noto Sans (OFL) | S23 mục 4a: `pdf-lib@1.17.1`, `@pdf-lib/fontkit@1.1.1`; `src/cli/seed/assets/fonts/NotoSans-Regular.ttf`, `OFL.txt`, `README.md`; `assets` trong `nest-cli.json`; cách test; §11 ngoại lệ | T1b, bản đồ tệp, T28 |
| Q-E: hai tệp có số khớp | S23 mục 2–3 (ba dòng đề xuất ở BM-10; tệp Finance đề xuất/đã chốt/chênh lệch; `p` từ `BUDGET_RESERVE_DEFAULT_PERCENT`); S24 script G | T1b, T9b |

## 4. Trả lời hai câu hỏi soát toàn bộ

**Chạy lại cùng ngày có ra exit 2 không?** Có, nếu làm đủ các sửa:

- C-1 (tài khoản khóa), C-2 (R57), C-10 (hóa đơn nộp lại), C-13 (hoàn trả);
- N-13 (ký và giải trình), N-16 (báo lỗi), N-17 (điều khoản).

Các bước còn lại đọc theo khóa nghiệp vụ ổn định (số chứng từ, thẻ `[SV-…]`, `assetCode`, Audit), không so ngày.
`exitCodeOf` chỉ trả 2 khi **mọi** bước `present` (`src/cli/seed/seed-runner.ts:60-65`). Lỗi 401 không phải `conflict` mà là `failed`
(`:46`). Đăng nhập bị từ chối thì ra `DemoSignInRefusedError`, tức `conflict` (`:43-44`).

**`--continue` ở `D0+1` có an toàn không?** Trước Review 2 thì **không**: N-1 chặn từ `org.employees`; N-2 làm DEMO-14 ra 422 nếu ENG
`GREEN`. Sau sửa:

- `org.*` ra `present`.
- DEMO-14 ghi được: ENG `UNDER` còn rộng; ITO chỉ có bổ sung chờ duyệt.
- S17 phát mã mới cho máy `ACTIVE` rồi gửi thêm ngày `D0+1`. Cửa sổ tính theo lúc xác nhận nên ngày `D0` gửi lại ra `UNCHANGED`.
- Chốt tháng chỉ thêm kỳ khi `tháng(D0+1) − 1 ≤ 10` và khác `tháng(D0) − 1`.
- Mọi bước dùng `baseFor` hay ngày tương đối chỉ đọc trạng thái, không so số.

**Route, vai, luật:** đã đối chiếu với `openapi.json`:

- `GET /audit-events?actorAppUserId&action`, `GET /app-users?status&activationState`, `GET /devices?search`;
- `GET /device-stop-requests?state`, `GET /subscription-renewals?subscriptionId`, `GET /return-requests?assignmentId`;
- `POST /device-enrollments` (header `Idempotency-Key`, `^[A-Za-z0-9_-]{16,128}$`,
  `devices/credential/enrollment/credential-enrollment.dto.ts:6`), `GET /monitoring-notices/current` (404 khi chưa có);
- `GET /plans/{id}/terms`, `PUT /operating-parameters/{key}` (`{ value }`), `POST /budget-review-periods/{id}/signature`;
- `POST /budget-versions` (`reservePercent` 0–100 + `reserveReason`).

Sai gốc duy nhất là N-6. Vai phụ trách sau Q-B đúng `organization.ts`: ITA1 phụ trách ENG/ITO/SAL/LGL; ITA2 phụ trách BOD/DES/FIN/MKT.

## 5. Câu hỏi mới

Không có câu hỏi cho Owner. Lưu ý vận hành, không cần quyết định: T1b phải tải font Noto Sans từ nguồn chính thức. Chat không có mạng
thì dừng và hỏi điều phối, không tự đổi sang chữ không dấu.
