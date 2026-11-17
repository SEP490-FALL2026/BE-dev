# AUDIT-A1 — review vùng catalog/tham số/quét định kỳ/test của SBF-20 (17/11/2026)

Nhánh `feat/p5-a1-sbf20`, phạm vi `94a8ee84..41c34c05`, worktree `Code/be-p5-a1`. **Chỉ đọc**: dùng `git show`/`git diff`/`git grep`,
`gh run view`; không sửa code, không checkout/stash/reset, không chạy pnpm/jest/docker.

**Skill đã đọc/dùng**
- `agent-skills:code-review-and-quality` (process + review): khung 5 trục, phân mức Critical/Required/Optional/Nit, mỗi phát hiện kèm cách sửa.
- `superpowers:verification-before-completion` (verification): mọi kết luận dưới đây dựa trên dòng code đã đọc ở `41c34c05`; trạng thái CI
  lấy từ `gh run view 44004119740` (xanh 8/8 job, Deploy bị skip). Không tự chạy test.
- Mapping: không có skill riêng cho "review nghiệp vụ SBF"; dùng `code-review-and-quality` làm cả process lẫn review.

**Vùng đã soi:** `5e8b54b8` (T2), `dc69bb2e`, `de95919a` (T9a), `9183409d` (T9b), `f687251f`, `fd6127c9` (T6), `aa53e9e3`, `d3114f8e`,
`11382d30` (viết lại test), `41c34c05` (flows). **Nguồn đối chiếu:** `SPEC-5A-SBF20.md` §0, §4.2, §4.5, §4.6, §5, §9, §10, §11, §13;
`REVIEW-SPECS-2-SBF20.md`; `A1-DONE.md` §3, §4, §6; `SBF-20-software-stock-subscription-management.md` bước 2, §5.1; sổ QĐ (QĐ-103n, 103t).

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 2 | R-1, R-2 |
| Optional | 8 | O-1 … O-8 |
| Nit | 3 | N-1 … N-3 |

**Số đếm tham số:** trên nhánh A1 là **31** (29 − 1 + 3), khớp ở cả 3 chỗ (`parameter-definitions.policy.spec.ts:190` "thirty-one" + danh
sách, `operating-parameters-http.integration-spec.ts:471` `toBe(31)`, `api-collection-registry-exceptions.ts:81` `maxItems: 31`). Trên
`feat/p5` hiện có **27** (đã gỡ 2 khóa ZBB, cả 3 chỗ đều là 27). **Sau khi gộp: 27 − 1 + 3 = 29** ⟹ ba chỗ phải là "twenty-nine"/`29`/`29`.
Cả 3 file, `parameter-definitions.policy.ts`, `notifications.types.ts`, `inbox.policy.ts`, `licensing.module.ts`, `security-jobs.md`,
`api-coverage-manifest.ts`, `openapi.json` đều bị cả hai nhánh sửa ⟹ xung đột chữ, gộp tay. Migration A2 `20261117100000_drop_zbb_parameters`
< A1 `20261117110000…110200` ⟹ thứ tự đúng.

**Đã khớp, không cần sửa:**
- Điểm điều chỉnh: tháng = hạn − `SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY`, năm = hạn chót báo hủy − `…_ANNUAL`, thiếu hạn chót ⟹ ngày gia hạn khi tự gia
  hạn (`subscription-obligation.policy.ts:140-170`).
- Cảnh báo đỏ năm `deadline − SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` cho IT phụ trách + Finance, không Người duyệt chi
  (`renewal-adjustment-alerts.policy.ts:44-45,75-84`).
- Người nhận đúng §13 cho cả 6 mã sweep. `PARAM_KEYS_BY_CODE` giữ khóa cũ của `SUBSCRIPTION_RENEWAL_ALERT` (`inbox.policy.ts:159-176`).
- Không gửi trùng: eventKey theo (mã, thuê bao, hạn) + `createMany skipDuplicates` theo người nhận; audit chỉ ghi cho người vừa được báo;
  `subscription_deadline_events` `ON CONFLICT (subscription_id)`. Nhiều instance chạy song song an toàn mà không cần khóa riêng.
- QĐ-106h: một hàm chọn instant (`adjustmentPeriodInstantOf`) dùng chung cho badge, filter `expiry`, `alerts.dates`, sweep và route
  (`SubscriptionWindowsService`). Có test integration đổi tham số giữa kỳ (`catalog-subscription-read-model.integration-spec.ts`, T9b).
- Kiến trúc: licensing → catalog/organization qua `public/`. Catalog → operating-parameters qua `public/`. Repo mới
  `SubscriptionPeriodRepo` chỉ đọc bảng của catalog. Licensing không còn phụ thuộc operating-parameters; module-graph đã cập nhật.
- Migration `20261117110200`:
  - forward-only, nằm trong dải;
  - đóng mọi giá trị đang mở (kể cả giá trị Super Admin đã sửa trên VPS), `GREATEST(CURRENT_TIMESTAMP, valid_from)` thỏa
    `parameter_values_period_check` (`>=`); chạy lại không đổi gì; theo đúng tiền lệ `20261108500000`;
  - ba khóa mới không cần dòng (mặc định ở `PARAMETER_DEFINITIONS`).
- Flows không còn đi qua route đã gỡ: `/decision` chỉ xuất hiện để khẳng định 404 (`mf5-rightsizing.flow-spec.ts:247-248`).
- Mutation ở chỗ chính bị bắt:
  - `adjustmentPointOf` (cửa sổ tháng/năm đổi chỗ, dấu): `subscription-obligation.policy.spec.ts`;
  - biên `point`/`redAlertOn`/`end`/`today === deadline`/60 ngày: `renewal-adjustment-alerts.policy.spec.ts:56-142`;
  - đổi khóa tham số: integration T9b.
- CI ở HEAD xanh (`44004119740`). Flows không chạy trong `ci.yml`; A1 báo chạy local 70 pass.

---

## Required

### R-1 — Gói tháng có `endDate` xa mà không có `renewalDate`: "ngày thanh toán kế tiếp" = `endDate`, điểm điều chỉnh chỉ mở 1 lần/năm
- **Mức:** Required (nghiệp vụ; cần điều phối chốt vì spec §4.2 ghi "`adjustmentPointOf` — không viết lại").
- **Chỗ:**
  - `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts:194-213` (`monthly`, `nextPayment`);
  - nối vào sweep/route ở `5e8b54b8`: `subscription-period.service.ts:44-61` (`adjustmentOf`).
- **Kịch bản:**
  - Gói tháng `startDate = 2026-01-01`, `endDate = 2026-12-31`, `renewalDate = null`, `autoRenew = true` (đúng hình dạng mọi gói tháng `K2`
    của dataset: `src/cli/seed/steps/catalog.steps.ts:228-236`).
  - Hôm nay 17/11 ⟹ `stored = endDate = 12-31`; `nextPayment` chỉ cuộn **tới**, không lùi ⟹ `deadline = 2026-12-31`, `point = 12-24`.
  - Hệ quả, từ nay tới 24/12:
    - IT ghi kết quả bị 409 `BEFORE_ADJUSTMENT_POINT`;
    - sweep không gửi `SUBSCRIPTION_RENEWAL_ALERT`;
    - không có `SUBSCRIPTION_RENEWAL_KEPT` cho các kỳ 30/11, 31/10…;
    - `GET /subscription-renewals/adjustment` hiện `deadline = 12-31`.
  - Trên VPS: 7 gói tháng kho (Jira, Slack, GitHub, 1Password, Postman, Mailchimp, Canva) không có luồng điều chỉnh tháng tới 24/12.
- **Căn cứ:**
  - `QĐ-106i`(2) "gói tháng: ngày gia hạn = ngày thanh toán kế tiếp";
  - spec §4.2 "tháng = ngày thanh toán kế tiếp (cuộn theo tháng từ `renewalDate ?? endDate`)";
  - `SBF-20` bước 2 "gói tháng 7 ngày trước ngày thanh toán" và §5.1.
- **Mâu thuẫn trong cùng hệ thống:** cờ *kỳ chưa có hóa đơn* (`requests/purchase-invoice/purchase-invoice-missing-periods.policy.ts:105-109`)
  dựng lưới thanh toán từ cùng neo `renewalDate ?? endDate ?? startDate` nhưng cuộn **cả hai chiều** ⟹ ngày thanh toán = 30/11. Hai chỗ đọc
  "ngày thanh toán" của cùng một thuê bao ra hai ngày khác nhau.
- **Cách sửa:**
  - Sửa `nextPayment`: chọn ngày đầu tiên ≥ `today` trên lưới `addMonths(stored, k)` với `k ∈ ℤ`, không sớm hơn `startDate` (lùi
    `while addMonths(stored, k − 1) >= max(today, startDate)`), cùng luật với `subscriptionPaymentPeriods`. Giữ chặn ở `endDate` khi
    `autoRenew = false`.
  - Sửa test `subscription-obligation.policy.spec.ts:189-191` (hôm nay 15/11, `endDate = 12-20` ⟹ hạn 20/11, không còn 20/12).
  - Thêm ca unit "endDate cách 2 tháng, renewalDate null ⟹ hạn là ngày lưới gần nhất".
  - Thêm ca integration sweep với gói tháng chỉ có `endDate` cuối năm.
  - Nếu điều phối không cho sửa catalog trong P5: tối thiểu seed đặt `renewalDate` cho gói tháng (ngày thanh toán kế tiếp), và ghi lệch vào
    "Breaking FE"/nợ 4b.

### R-2 — Flow `mf5-rightsizing-edges` phụ thuộc lịch thật: đỏ từ 24/12 tới 31/12 (và đỏ hằng tháng nếu sửa R-1)
- **Mức:** Required (test sẽ đỏ theo ngày).
- **Chỗ:** `test/flows/mf5-rightsizing-edges.flow-spec.ts:22-23` (giả định "Jira … before its point today"), `:152-154`
  (`expect(seen.adjustmentPointOn > call().today()).toBe(true)`).
- **Kịch bản:**
  - Jira trong dataset có hạn = `endDate` 31/12 (R-1) ⟹ `adjustmentPointOn = 24/12`.
  - Chạy flows từ 24/12 tới 31/12 ⟹ assert dòng 154 sai, sau đó `early` trả 201/409 khác ⟹ test đỏ. `FlowClock.start()` neo vào ngày
    thật nên không tránh được.
  - Sau khi sửa R-1, hạn Jira cuộn theo tháng ⟹ đỏ khoảng 8 ngày mỗi tháng.
- **Căn cứ:** `test/support/flows/flow-clock.ts:45-52` (giờ giả = ngày thật), `src/cli/seed/fixture/shared-demo-v4/catalog.ts:176` +
  `catalog.steps.ts:228-236`.
- **Cách sửa:**
  - Trong test, trước khi đọc: đặt ngày thanh toán của Jira tương đối với hôm nay qua SQL như các ca khác của file
    (`UPDATE subscriptions SET renewal_date = $today + 20, end_date = NULL WHERE id = $jira`), rồi khẳng định `adjustmentPointOn = renewal − 7`.
  - Hoặc thêm vào seed một gói tháng có `renewalInDays` cố định.
  - Kiểm bằng cách chạy file với `FlowClock` đặt ngày 26/12 (hoặc `jest.setSystemTime`) ⟹ phải xanh.

---

## Optional

### O-1 — Sweep dùng hai "hôm nay": `sweep(now)` và `businessToday(new Date())` trong catalog
- **Chỗ:** `subscription-renewal-sweep.service.ts:62-63`; `catalog/subscription/period/subscription-period.service.ts:298` (`withSuccessors`).
- **Kịch bản:**
  - `period.adjustment` (hạn gói tháng cuộn theo ngày) tính theo ngày thật, còn `candidateNotices` so với `today` của `now`.
  - Chạy tay `sweep(now)` cho ngày khác (như `security-jobs.md` hướng dẫn) ⟹ gói tháng lệch kỳ.
  - Lượt chạy vắt qua nửa đêm ⟹ catalog đã cuộn sang tháng sau, sweep còn ngày thanh toán ⟹ mất `KEPT` tháng đó. Xác suất nhỏ.
  - Test integration hiện đúng chỉ nhờ dữ liệu neo vào ngày thật (`sweep-integration-spec.ts:218-249`).
- **Cách sửa:** `listAdjustmentSubjects(today)` nhận ngày từ sweep, truyền xuống `withSuccessors`.
  - Test: unit sweep với `now` = ngày thanh toán + 1 của một gói tháng ⟹ kỳ kế (không còn `KEPT`).

### O-2 — Một thuê bao lỗi làm dừng cả lượt quét, mỗi giờ
- **Chỗ:** `subscription-renewal-sweep.service.ts:73-77`.
- **Kịch bản:**
  - `countFor` (hook requests), `notifyInApp` (validate params) hay `insertDeadlineEvent` ném lỗi với thuê bao thứ k ⟹ thuê bao k+1…500 không
    bao giờ được quét.
  - Job chỉ log lỗi, lỗi lặp lại mỗi giờ.
  - `SeatMonthSweeper` cùng repo đã theo mẫu "a subscription that fails does not stop the others" (`security-jobs.md:77`).
- **Cách sửa:** `try/catch` quanh `sweepPeriod`, log `describeForOperator`, đếm `failed` trong `SweepResult`.
  - Test: unit sweep với `countFor` ném ở thuê bao 1 ⟹ thuê bao 2 vẫn được báo.

### O-3 — R2-12 chưa đạt: `countFor` (2 SQL + 2 hook) chạy mỗi giờ suốt cửa sổ, kể cả khi thông báo đã gửi
- **Chỗ:** `subscription-renewal-sweep.service.ts:88-115`; `renewal-adjustment-alerts.policy.ts:35-40`.
- **Kịch bản:**
  - Gói năm có cửa sổ từ `point` tới `end` (≥ 30 ngày) ⟹ `candidateNotices` luôn có `ADJUSTMENT_POINT` ⟹ tính số seat mỗi giờ.
  - 100 thuê bao trong cửa sổ ⟹ 100 × 4 truy vấn mỗi giờ, chỉ để `skipDuplicates`.
  - Reviewer của A1 đã nêu (O-3 trong `A1-DONE` §8).
- **Cách sửa:** đọc một lần các eventKey đã có (`in_app_notifications` qua facade notifications, hoặc audit `ALERT_SENT` của thuê bao + hạn)
  và bỏ ứng viên đã gửi trước khi `countFor`.
  - Test: unit "kỳ đã báo điểm, chưa tới đỏ ⟹ `countFor` không gọi".

### O-4 — Không ràng buộc `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` ≤ `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL`
- **Chỗ:**
  - `parameter-definitions.policy.ts:315-336` (đỏ 1–90, cửa sổ 1–180, không kiểm chéo);
  - `renewal-adjustment-alerts.policy.ts:35-37` (đỏ chỉ xét sau `point`);
  - `subscription.policy.ts:70-77` + `subscription-view.service.ts:65-79` (`alerts.dates` hiện `redAlertOn`).
- **Kịch bản:** Super Admin đặt đỏ = 45, cửa sổ = 30 ⟹ catalog hiện `alerts.dates = [point, redAlertOn]` với `redAlertOn` **trước** `point`,
  trong khi sweep chỉ phát đỏ từ `point`. Ngày hiển thị khác ngày phát.
- **Cách sửa:** `validateParameterValue` đã nhận giá trị hiện hành (tham số thứ 3) ⟹ thêm luật chéo `red ≤ annual` cho cả hai khóa
  (422 `OUT_OF_RANGE`/mã chéo đã có).
  - Test: unit + integration đặt đỏ > cửa sổ ⟹ 422.

### O-5 — `KEPT` cho gói tháng không tự gia hạn đúng ngày kết thúc (đã ghi ở `A1-DONE` §8.1)
- **Chỗ:** `renewal-adjustment-alerts.policy.ts:38`.
- **Kịch bản:**
  - Gói tháng `autoRenew = false`, `endDate = D`, dư seat ⟹ ngày D nhận "giữ nguyên N seat" dù kỳ thật sự kết thúc; ngày D+1 nhận
    `EXPIRY_MARKED`. Hai thông báo trái nhau.
  - `QĐ-103v`(5) nói về gói tháng **tiếp tục** (NCC tự trừ tiền).
- **Cách sửa:** chờ Owner. Nếu đồng ý: điều kiện `KEPT` thêm `autoRenew`.
  - Test: policy `due(monthly, deadline, { autoRenew: false })` không chứa `KEPT`.

### O-6 — Ca `DECIDED` cũ chặn mọi cảnh báo/sự kiện của thuê bao vô thời hạn, và cờ trễ đã bị gỡ
- **Chỗ:** `record/renewal-record.policy.ts:133-139` (`existingCaseOf` lấy **mọi** ca `DECIDED`), `subscription-renewal-sweep.service.ts:88-91`.
  `flagLateIfDue` + `repo.flagLate` đã bị xóa ở `fd6127c9`.
- **Kịch bản:**
  - Thuê bao có ca `DECIDED` trước deploy mà IT không ghi `/outcome`: không còn điểm điều chỉnh, đỏ, `EXPIRY_MARKED` hay sự cố, cho mọi kỳ về
    sau, và không ai được nhắc.
  - Spec §4.5 bỏ cờ trễ với giả định "không còn ca DECIDED treo", nhưng migration giữ nguyên `DECIDED`.
  - Rủi ro thấp nếu VPS seed lại (`A1-DONE` §5).
- **Cách sửa:** một trong hai.
  - (a) Chỉ coi `DECIDED` cũ là "ca của kỳ" khi `noticeBaseDate ≥ deadline − 1 năm`.
  - (b) Giữ một nhắc `SUBSCRIPTION_RENEWAL_LATE` cho ca `DECIDED` cũ quá `end`.
  - Test: integration ca `DECIDED` cũ + qua `end` ⟹ có nhắc.

### O-7 — Mất test integration của định tuyến IT phụ trách trong sweep (QĐ-111g, BB-9) và ca hạn chót suy ra
- **Chỗ:**
  - test cũ `subscription-renewal-sweep.integration-spec.ts` @94a8ee84 dòng 268 (IT phụ trách thuê bao thay IT phụ trách phòng; rơi về phòng
    khi null/khóa) và dòng 78 (đếm từ hạn chót suy ra `INFERRED_UNCONFIRMED`);
  - file mới `@41c34c05` chỉ dùng `h.it1` cho mọi ca.
- **Độ phủ còn lại:** unit `subscription-renewal-parties.service.spec.ts:42-175` vẫn phủ logic. Mất phần nối thật với `identity`/`organization`
  ở luồng quét.
- **Cách sửa:** thêm 1 ca integration — thuê bao có `responsible_it_admin_employee_id = it2`, phòng có `it1` ⟹ `SUBSCRIPTION_RENEWAL_ALERT`
  tới `it2`; khóa `it2` ⟹ tới `it1`. Thêm 1 ca `noticePeriodDays` (không khai hạn chót) ⟹ `baseDate = renewal − N`.

### O-8 — Giới hạn 500 theo `id` không cursor ⟹ thuê bao K2 thứ 501 trở đi không bao giờ được quét (R2-12, đã biết)
- **Chỗ:** `catalog/subscription/period/subscription-period.repo.ts:13-21`.
- **Cách sửa:**
  - Ưu tiên (rẻ): lọc ở SQL những dòng có ngày trong cửa sổ `[today − 60, today + 180]` (`renewal_date`/`end_date`/`notice_deadline`)
    trước khi `take`.
  - Hoặc cursor xoay vòng theo giờ.
  - Test: integration 501 thuê bao, thuê bao cuối có việc ⟹ được báo.

---

## Nit

- **N-1:** comment "no order" sai so với `orderBy: { id: 'asc' }`. Chỗ: `subscription-renewal-sweep.service.ts:43-44`,
  `docs/rules/security-jobs.md:178`.
- **N-2:** fixture `endsOnItsDate` trong `renewal-adjustment-alerts.policy.spec.ts:126-131` dùng `kind: 'END_DATE'` cho gói tháng; `monthly()`
  luôn trả `PAYMENT_DATE` ⟹ ca test là hình dạng không bao giờ xảy ra. Đổi thành `PAYMENT_DATE`.
- **N-3:** `operating-parameters-http.integration-spec.ts:336-369` đặt 3 tham số (14/45/10) và không trả về mặc định. Các ca sau trong cùng
  file (hoặc ca nào kiểm `isDefault` nếu đổi thứ tự) phụ thuộc thứ tự chạy ⟹ thêm `finally` đóng giá trị (`valid_to`) như
  `catalog-subscription-read-model` làm.

---

## Rà D-n vùng này (`A1-DONE` §3) và mục báo cáo

- D-1, D-14, D-15, D-16, D-17, D-18: khớp code và spec. D-16: hằng 180 có test so `constraints.max` (`operating-parameters-http …:366-368`).
- `A1-DONE` §4 "Thông báo mới cho 5b": các dòng `ALERT`/`RED_ALERT`/`KEPT`/`AUTO_RENEWAL_INCIDENT` (sweep)/`EXPIRY_MARKED`/`DATA_QUALITY`
  khớp code (`renewal-alerts.service.ts:85-105`, `renewal-deadline.service.ts:67-76`).
- `A1-DONE` §5 "Breaking FE" có `alerts.dates` và tham số vận hành. **Thiếu:** R-1 — gói tháng không có `renewalDate` có điểm điều chỉnh =
  `endDate − 7` — nếu không sửa trong P5, cần ghi vào mục này.
- `A1-DONE` §6 số đếm: đúng (31 trên nhánh; dự kiến 29 sau gộp — xác nhận: `feat/p5` hiện 27).

## Kết luận vùng này

**Chưa merge được.** Không có Critical. Cần hai việc:
- **R-1:** sửa `nextPayment` (hoặc điều phối chốt cách tạm: seed `renewalDate` + ghi Breaking FE);
- **R-2:** flow không phụ thuộc lịch.

Sau đó merge được. Khi merge với A2: đặt số đếm 29 ở 3 chỗ, gộp tay `notifications.types.ts`/`inbox.policy.ts`/`security-jobs.md`.
O-1…O-8 có thể đưa vào FIX/4b.
