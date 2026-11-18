# A1-DONE — SBF-20 (nhánh `feat/p5-a1-sbf20`, worktree `Code/be-p5-a1`, 17/11/2026 đêm)

HEAD `41c34c05` (16 commit trên `dev` @ `94a8ee84`), đã push `origin/feat/p5-a1-sbf20`. **Không** push/merge `dev`/`main`.
Báo cáo do chat điều phối A1 (Sonnet) viết; code do subagent Sonnet từng gói, review diff độc lập một lượt cuối.

## 0. Skill đã dùng

- `superpowers:subagent-driven-development` (process: một subagent Sonnet mỗi gói, tuần tự), `superpowers:test-driven-development` (subagent làm test đỏ trước, trừ chỗ ghi ở "Lệch TDD"), `superpowers:verification-before-completion` (chỉ báo lệnh đã chạy thật).
- Không có skill review-spec riêng: reviewer cuối là subagent Sonnet đọc spec §10/§13 + REVIEW-SPECS-2-SBF20 (mapping ghi tại đây).
- **Lệch quy trình:** `agent-skills:*` của `D:\FPT\FALL2026\CLAUDE.md` Skill Preflight không nạp riêng; dùng `superpowers:*` thay (mapping gần nhất).

## 1. Bảng task → commit → kết quả

| Task | Commit | Lệnh đã chạy (local) | Kết quả thật |
| --- | --- | --- | --- |
| S20-T1 migration + kiểu | `2716997d` | prisma validate/generate, typecheck, lint, arch:check, rules:check, test:gates, `migrate deploy` DB trống, `migrate diff`, integration outcome + adjustment-data | xanh; gates 335/335; integration 11/11 |
| S20-T2 catalog facts + điểm điều chỉnh | `5e8b54b8` | typecheck, lint, gates, jest catalog+renewal, 10 integration | 44 suite/602 unit; 10/10 integration |
| S20-T3 số seat cần + điều kiện hủy | `75047f60` | như trên + 3 integration | 22 suite/247 unit; 3 suite/30 test |
| S20-T4a lõi ghi một lần | `80192b22` | như trên + integration record | integration record 5/5 |
| S20-T4b + S20-T7 controller/DTO/xóa CONFIRM, Finance đọc | `4f98e772` | http-spec renewals, integration, lint toàn bộ | http-spec 54/54; integration 17/17; unit 62 suite/962 |
| **Checkpoint sau T4** | (không có commit) | `migrate deploy` DB **trống**, `migrate diff --exit-code`, 8 integration | "All migrations applied", **"No difference detected"**, 8 suite/68 test |
| S20-T4c (R2-8) mua thêm seat kỳ kế khi kho đầy | `e7abcdb5` | integration 8 file + http provisioning/renewals | 8/8 (88 test); http 123/123 |
| S20-T5 route xem số cần | `d9c1f2e6` | http-spec renewals, unit licensing | http 68/68; unit 46 suite/694 |
| S20-T9a catalog thôi đọc tham số cũ | `dc69bb2e`, `de95919a` | migrate deploy+diff, unit, integration, openapi-response-examples | OK; 59 integration; 7/7 http |
| S20-T9b 3 tham số `FR-8.2` (7/30/7) | `9183409d` | unit catalog 551 + operating-parameters 38; integration 2 file | xanh; 34 integration |
| S20-T6 quét định kỳ theo điểm điều chỉnh | `f687251f`, `fd6127c9` | unit 814 ca; integration sweep (viết lại) 12 ca | xanh |
| Viết lại test cũ (không để nợ) + rút ngắn summary route `outcome` | `aa53e9e3`, `d3114f8e`, `11382d30` | 15 file integration renewal/machine-account/ai-summary, 2 http-spec platform | 15 suite/115 test, 0 lỗi; http 23/23 |
| Flows (MF-5 ×3, f0-auth-roles) | `41c34c05` | `pnpm test:flows` toàn bộ | 11 suite pass + 1 skip; 70 pass, 9 skip, 0 fail |

Mọi task chạy: `pnpm typecheck`, `pnpm lint` (toàn bộ), `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates` (**16 suite / 335 test**), `pnpm arch:docs:check`. Không chạy local `test:http` toàn bộ / integration toàn bộ theo chỉ đạo điều phối 123 — CI GitHub chạy.

## 2. CI GitHub (`ci.yml`, workflow_dispatch trên nhánh)

| Run | Commit | Kết quả |
| --- | --- | --- |
| [43989887483](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/43989887483) | T4c `e7abcdb5` | đỏ — 7 file integration luồng cũ + `openapi-presentation` (dự kiến, xem nợ test cũ) |
| [43996200108](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/43996200108) | T9b `9183409d` | đỏ — cùng nhóm trên (không lỗi mới) |
| [44002112191](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44002112191) | `11382d30` | **xanh toàn bộ** (select, quality, e2e-smoke, http-contract, integration-inband, integration 1/2/3; Deploy bị skip) |
| [44004119740](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44004119740) | HEAD `41c34c05` (chỉ thêm test flows) | **xanh toàn bộ** (select, quality, e2e-smoke, http-contract, integration-inband, integration 1/2/3; Deploy bị skip) |

## 3. Decision `D-n` (tự chốt đêm; Owner duyệt sáng)

Từ chat điều phối/spec: R2-8 = làm `S20-T4c` (Owner chốt đêm 17/11); S20-Q4 = A, Q1/Q2/Q3 = A.

| Mã | Quyết định (phương án an toàn không trái QĐ) | Căn cứ / khuyến nghị |
| --- | --- | --- |
| D-1 (T2) | `redAlertOn` là `BusinessDate \| null` (null cho gói tháng) | §5 spec; giữ |
| D-2 (T2→T6) | Sweep tạm bỏ kho cho tới T6; T6 đã viết lại, không còn | đã xử lý |
| D-3 (T3) | `seatsNeededFacts` nhận thêm `today` (business date theo múi giờ tổ chức) | không dùng `CURRENT_DATE`; giữ |
| D-4 (T3) | `activeSeatsToday` đếm theo R2-4 = mọi ghế chưa kết thúc hôm nay (`notEndedBy`), gồm ghế bắt đầu sau hôm nay và ghế đang thu hồi | spec: R2-4 thắng prose §4.4 |
| D-5 (T3) | Ghế "chờ tiếp tục" = ghế không bị thu hồi, ngày cuối ≤ `renewalOn`, bắt đầu ≤ hôm nay | giữ |
| D-6 (T4) | Thông báo `OUTCOME_RECORDED` dùng subject `{ type: 'SUBSCRIPTION', id }` (§13), khác subject `SUBSCRIPTION_RENEWAL` cũ | giữ |
| D-7 (T4) | `substituteOf`: người phụ trách "dùng được" = còn là IT Admin hoạt động; bị khóa/nghỉ ⟹ `substitute:false`, audit `responsibleItAdminEmployeeId = null` | QĐ-58b/104l |
| D-8 (T4) | Kiểm `closure` đặt ở zod (422 `VALIDATION_ERROR`) nên trả trước 409 `CANCEL_NOT_ALLOWED` (hình dạng trước) | FE đọc `canCancel` trước khi gửi |
| D-9 (T4) | `unintendedRenewalOf`: CANCEL kèm bất kỳ `nextPeriod` là sự cố; REDUCE chỉ khi `nextQuantity > proposedQuantity` | QĐ-106i(4) |
| D-10 (T4b) | Giữ `RenewalRankingService`, route `seat-ranking` (deprecated), codec `decision-snapshot.json`; `waitingReason` giữ trên wire, luôn `null` | spec §5/§9 → gỡ ở 4b-5 |
| D-11 (T4b) | `lateRenewal` không có cột DB, tính lại khi đọc (ngày gia hạn so ngày ghi) | không cần migration |
| D-12 (T4c) | Điều kiện "kho" = `next.ownerDepartmentId === null`; dùng SAVEPOINT để thử lại sau `SEAT_CAPACITY` vì trigger INV-01 làm abort tx | giữ; **brief ghi 409, thực tế 422 `PROVISIONING.SUBSCRIPTION_NEXT_PERIOD_SEATS`** — giữ 422 |
| D-13 (T5) | `suggestedChoice` cho phép `null` (spec §5: chuỗi không null); `callerIsResponsible=false` khi không có IT phụ trách | cần FE biết |
| D-14 (T9a) | `alerts` chỉ có giá trị với thuê bao đang chạy một kỳ (TERM/ACTIVE/chưa nối tiếp); bản nháp, kỳ đã nối, PERPETUAL ⟹ `alerts={baseDate:null,dates:[]}` | cùng nguồn với badge `expiry` |
| D-15 (T9b) | Instant kỳ: gói năm = đầu ngày `startDate`; gói tháng = `max(startDate, addMonths(deadline,−1))`; `startDate=null` ⟹ ngày của `createdAt` | R2-9, QĐ-106h; lệch múi giờ ≤ 1 ngày |
| D-16 (T9b) | `ANNUAL_WINDOW_DAYS_MAX = 180` hằng ở `subscription-windows.service.ts` (catalog không import policy module khác); có test so `constraints.max` | nếu nới biên 180 phải sửa hằng |
| D-17 (T6) | `NO_ALERT_ANCHOR` giữ eventKey cũ; `NO_NOTICE_DEADLINE` thêm hậu tố problem; audit đỏ/KEPT dùng lại action `SUBSCRIPTION_RENEWAL.ALERT_SENT` kèm `after.kind` | không tạo action mới |
| D-18 (T6) | Tới điểm điều chỉnh chỉ báo **IT phụ trách**; Finance chỉ nhận cảnh báo đỏ + sự cố/hết hạn | đúng bảng §4.5 (brief nói IT+Finance — spec thắng) |
| D-19 (T8) | Race hai IT ghi cùng lúc: `[201, 409]`, mã 409 = `ALREADY_PROPOSED` hoặc `NOT_RENEWABLE` | spec §8.10 chưa ghim mã cụ thể |
| D-20 (T8) | Xóa test của luồng đã bỏ (CONFIRM, NO_HEAD, NOT_DECIDER, PROPOSER_IS_OWNER_HEAD, ACTIVE_USERS_NOT_ACKNOWLEDGED, PROPOSAL_STALE, EXCESS_SELECTION_INVALID…); độ phủ phần còn đúng chuyển sang `rules`, `legacy-outcome`, `reads` | spec §4/§9 |

## 4. Thông báo mới cho 5b (chỉ phần lệch so với bảng bàn giao §13)

Subject mọi dòng: `{ type: 'SUBSCRIPTION', id: subscriptionId }`.

| Mã | Mới/đổi | Params | Người nhận | eventKey |
| --- | --- | --- | --- | --- |
| `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` | mới (T4) | `renewalId, subscriptionId, choice, quantity, outcome, nextSubscriptionId, substitute` | Finance (+ IT phụ trách khi ghi thay) | theo trail |
| `SUBSCRIPTION_RENEWAL_ALERT` | đổi params + người nhận | `subscriptionId, renewalId`(null), `baseDate`(=hạn), `renewalOn`(=`end`), `seatsNeeded`, `commitment` (`MONTHLY`\|`ANNUAL`); khóa cũ (`milestoneDays, noticeBasis, audience, decisionRecorded, outcomeRecorded, usageData`) giữ trong `PARAM_KEYS_BY_CODE` | chỉ IT phụ trách | `subscription-adjustment-point:<sub>:<deadline>` |
| `SUBSCRIPTION_RENEWAL_RED_ALERT` | mới (T6) | `subscriptionId, baseDate, renewalOn, seatsNeeded` | IT + Finance (không Người duyệt chi) | `subscription-renewal-red:<sub>:<deadline>` |
| `SUBSCRIPTION_RENEWAL_KEPT` | mới (T6) | `subscriptionId, renewalOn, purchasedQuantity, seatsNeeded` | IT phụ trách | `subscription-renewal-kept:<sub>:<deadline>` |
| `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | đổi người nhận + `renewalId` | `subscriptionId, baseDate`(=`end`), `renewalId`(null ở sweep) | IT + Finance + Người duyệt chi | `subscription-incident:<sub>:<end>` |
| `SUBSCRIPTION_EXPIRY_MARKED` | đổi người nhận | `subscriptionId, baseDate`(=`end`), `endDate` | IT + Finance | `subscription-expiry:<sub>:<end>` |
| `SUBSCRIPTION_RENEWAL_DATA_QUALITY` | thêm giá trị `problem` | `subscriptionId, problem` ∈ {`NO_ALERT_ANCHOR`, `NO_NOTICE_DEADLINE`} | IT phụ trách | `NO_ALERT_ANCHOR` giữ key cũ; `NO_NOTICE_DEADLINE` thêm hậu tố |
| `SUBSCRIPTION_SEATS_INCREASED` (T4c) | không đổi mã, phát thêm khi cấp từ kho mua thêm seat kỳ kế | đã có | IT phụ trách thuê bao | đã có |

Không còn phát: `_LATE`, `_PROPOSED`, `_DECIDED`, báo trưởng phòng/Super Admin ở luồng gia hạn. README notifications ghi 10 mã `SUBSCRIPTION_*`; `inbox.policy.spec` 8 → 10.

## 5. Breaking FE

- `POST /subscription-renewals`: body strict mới (`outcome` bắt buộc; bỏ `releasedAssignmentIds`; `closure` chỉ với CANCEL; `outcomeNote` bắt buộc khi VENDOR_REFUSED/DIFFERENT). Message `SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED`. 201 luôn `state = OUTCOME_RECORDED`, `deciderRole = IT_ADMIN_IN_CHARGE`.
- `POST /subscription-renewals/{id}/decision` **gỡ** (404). Gỡ 7 mã lỗi chỉ phục vụ CONFIRM: `NOT_DECIDER, PROPOSER_IS_OWNER_HEAD, NOT_AWAITING_DECISION, ACTIVE_USERS_NOT_ACKNOWLEDGED, EXCESS_SELECTION_INVALID, PROPOSAL_STALE, MID_TERM_NOT_ALLOWED`. Mã mới: `BEFORE_ADJUSTMENT_POINT`, `QUANTITY_NOT_SEATS_NEEDED`, `CANCEL_NOT_ALLOWED` (details 6 khóa), `VENDOR_MINIMUM_EVIDENCE_REQUIRED`; `NOT_RENEWABLE.details.reason`; `ALREADY_PROPOSED.details.renewalId`.
- Route mới `GET /subscription-renewals/adjustment?subscriptionId=` (IT Admin + Finance; `subscriptionRenewalAdjustmentGet`; 409 `NOT_RENEWABLE` cho K1/K4/K5; `suggestedChoice` có thể `null`).
- Thuê bao kho K2 không phòng sở hữu đọc/ghi được: `ownerDepartmentId` **nullable** ở `subscriptionRenewalList/Get`, `subscriptionDeadlineEventList`; trưởng phòng không thấy ca kho (404); Finance đọc `subscription-deadline-events` và list/get (200).
- DTO đọc: `proposal.seatsNeeded` (null ở ca cũ), `outcomeDetail.lateRenewal`, `deciderRole` có `IT_ADMIN_IN_CHARGE`, `INCREASE`; `waitingReason` luôn `null`. `subscriptionDeadlineEventList`: `noticeBaseDate`/`milestoneDate` nay là ngày gia hạn `end`; không còn set `late_flagged_at` mới.
- `operatingParameterList`: **bỏ** `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`; **thêm** 3 khóa nhóm `SUBSCRIPTION` (`SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY` 1–28 mặc định 7, `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` 1–180 mặc định 30, `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` 1–90 mặc định 7).
- `subscriptionList/Get`: `alerts.dates` = 1 phần tử (gói tháng) hoặc 2 phần tử (gói năm: điểm điều chỉnh, cảnh báo đỏ), `alerts.baseDate` = hạn của điểm; bản nháp/kỳ đã nối/vĩnh viễn ⟹ `{ baseDate: null, dates: [] }`. `plan-warnings`/`TERMS_REVIEW_DUE`: `reviewFrom` = hạn − cửa sổ năm (30), trước là 15.
- Cấp từ kho (`provisioning`): ca từng 422 `NEXT_PERIOD_SEATS` khi kỳ kế của kho đầy nay trả 201 (mua thêm 1 seat kỳ kế, báo IT phụ trách); kỳ kế do phòng sở hữu giữ 422.
- Thuê bao không phải kho `K2` (K1 có phòng, K5, dòng cũ) không còn cảnh báo/sự kiện gia hạn (đúng `FR-1.12(9)`).
- **Cần seed lại VPS sau deploy:** migration `20261117110100` đóng ca `PROPOSED` cũ thành `STALE` (ca `DECIDED`/`OUTCOME_RECORDED` giữ nguyên; `DECIDED` cũ chỉ ghi kết quả qua route legacy `/outcome`).
- Ảnh hưởng theo vai (§5 spec): **IT Admin** — một lần ghi thay cho đề xuất→xác nhận→kết quả, đọc `adjustment` trước; **trưởng phòng** — hết bước CONFIRM và thông báo gia hạn, không thấy ca kho; **Finance** — nhận `OUTCOME_RECORDED`, đỏ, sự cố/hết hạn; đọc deadline-events; **Người duyệt chi** — chỉ nhận sự cố tự gia hạn; **Super Admin** — không còn nhận `NO_HEAD`/mốc cuối.

## 6. Số đếm tham số trên nhánh

`PARAMETER_DEFINITIONS` = **31 khóa** (dev 29: −1 `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, +3 `SUBSCRIPTION_*`). Đã đặt ở 3 chỗ: `parameter-definitions.policy.spec.ts` ("thirty-one" + danh sách), `operating-parameters-http.integration-spec.ts` `parameters.size = 31`, `api-collection-registry-exceptions.ts` `maxItems = 31`.
Điều phối: `feat/p5` đã có A2 (−2 ZBB) ⟹ tính lại khi merge (dự kiến 29 − 2 − 1 + 3 = 29, cộng thêm của C).

## 7. Migration (dải `20261117110000`–`110900`)

- `20261117110000_licensing_renewal_adjustment_values` (enum), `20261117110100_licensing_renewal_adjustment_rules` (cột `seats_needed`, CHECK, `decider_role`, index `subscription_renewals_one_live_per_period`, `PROPOSED`→`STALE`), `20261117110200_retire_renewal_alert_days` (đóng `valid_to` giá trị cũ).
- Đã kiểm: `migrate deploy` trên DB **trống** + `migrate diff --exit-code` = "No difference detected" (checkpoint T4 và sau T9a).
- Đã kiểm trên DB **có dữ liệu cũ** (reviewer độc lập, DB tạm đã drop): áp 275 migration cũ, chèn 4 thuê bao K2 + ca PROPOSED/DECIDED/OUTCOME_RECORDED/STALE + `parameter_values` cũ, áp 3 migration mới ⟹ không lỗi; 3 ca `PROPOSED` → `STALE`; `DECIDED`/`OUTCOME_RECORDED` giữ nguyên; index mới có, index cũ mất; giá trị tham số cũ 0 dòng mở; chạy lại `110200` không đổi gì; ca thứ hai cùng kỳ bị `one_live_per_period` chặn; diff không drift.
- Chưa kiểm: nội dung `RAISE NOTICE` (Prisma ẩn); tương tác với `license_assignments`/Request thật trong migration.

## 8. Nợ test / Nghi lỗi logic / Đã cắt

**Nợ test:** không còn nợ ở phạm vi A1. Test đỏ vì luật mới đã được viết lại trong nhánh (7 file integration, `renewal-harness`, `ai-summary-harness`, flows MF-5 ×3, `f0-auth-roles`) — khác với dự kiến "để FIX-TEST" vì `P5-COMMON.md` yêu cầu CI xanh ở commit cuối. Chưa có flow ghi `CANCEL` thành công (dataset luôn còn ghế/Request mở); CANCEL thành công có ở integration `subscription-renewal-record`.

**Nghi lỗi logic (không sửa):**
1. §4.5 dòng *KEPT* không có điều kiện `autoRenew` ⟹ gói tháng `autoRenew=false` có `endDate` nhận "giữ nguyên N seat" đúng `endDate`, hôm sau `EXPIRY_MARKED`. Làm đúng spec/QĐ-103v(5); thêm `autoRenew` vào điều kiện KEPT là một dòng trong `renewal-adjustment-alerts.policy.ts` nếu Owner muốn.
2. `listAdjustmentSubjectIds` lấy `take 500 orderBy id` ⟹ thuê bao K2 thứ 501 không bao giờ được quét (R2-12 đã biết; comment trong sweep ghi "no order" nhưng thực tế có order theo id).
3. Reviewer: không kiểm chéo giữa tham số cảnh báo đỏ (1–90) và cửa sổ gói năm (1–180): đặt đỏ lớn hơn cửa sổ thì `alerts.dates` hiện `redAlertOn` trước điểm (sweep vẫn đúng).
4. Reviewer O-1…O-5 (Optional): ca người phụ trách bị khóa chỉ có unit; test sự cố QĐ-106i(4) assert yếu (`length >= 2`); sweep gọi `countFor` mỗi giờ trong cả cửa sổ điểm điều chỉnh (đã báo vẫn tốn truy vấn); `period.adjustment` dùng `businessToday(new Date())` còn `record(now)` nhận `now` tiêm.

**Đã cắt / chưa làm (đúng PLAN §5):** không cắt gì. Ngoài phạm vi A1 (4b): KPI-4, *tạm ngưng do NCC*, tự gia hạn qua hóa đơn, *đã đóng* ở catalog, gỡ route `seat-ranking`/`released_seats`, gói tháng cùng dòng, tỷ lệ chi phí seat Trống (4b-8).

**Lệch TDD (thành thật):** spec `subscription-obligation-period.policy` (T9b) và spec parties/alerts-service/deadline-service (T4a/T6) viết sau hoặc cùng code, không có lần đỏ riêng; còn lại có lần đỏ đúng lý do.
**Lưu ý lịch sử commit:** `f687251f` (notifications T6) đứng riêng không biên dịch (4 file policy cũ bị `git rm` vào commit đó trước service) — cả hai commit T6 gộp lại đúng; không viết lại lịch sử vì đã push.

## 9. Trạng thái cuối

**CI GitHub xanh trên commit cuối `41c34c05`** (run 44004119740, mọi job success, Deploy skipped). Nhánh `origin/feat/p5-a1-sbf20` = HEAD, cây làm việc sạch. Chưa merge vào `feat/p5` — chờ điều phối (thứ tự A2 → A1 → C → B; gộp tay `notifications.types.ts`, `inbox.policy.ts`, `parameter-definitions.policy.ts` + 3 chỗ đếm tham số; chạy `pnpm openapi:export` sau merge).

---

# FIX ĐỢT 2 (audit A1 của chat điều phối 123, 17/11)

Nguồn: `AUDIT-A1-core-review.md` (A1C-01…12) + `AUDIT-A1-sweep-review.md` (R-1, R-2, O-1…O-8, N-1…N-3). Nhánh `feat/p5-a1-sbf20`, 10 commit mới `9de0533e`…`2846f91d` trên `41c34c05`; mỗi mục một commit, test đỏ trước.

| Mục | Commit | Kết quả / lệnh thật |
| --- | --- | --- |
| A1C-01 `approvedAwaitingGrant` luôn 0 với kho K2 | `9de0533e` | đếm theo Request đã duyệt chờ cấp qua hook `RenewalHold.approvedAwaitingGrantOfPlan` (không query bảng chéo); bỏ câu `awaitingGrant` cũ; test chèn tay `subscription_id=NULL` đã xóa, thay 4 ca dựng bằng luồng thật; mutation bỏ hạng tử ⟹ 2 ca đỏ; integration seats-needed 7/7 |
| A1C-02 CANCEL xong vẫn sống | `1c51a459` | `NOT_RENEWABLE` `reason=CANCELLED` (POST + GET adjustment), sweep bỏ qua, đường cấp loại thuê bao đang hủy; spec integration mới 5 ca đỏ 5/5 rồi xanh; unit licensing 724 |
| A1C-03 ngõ cụt khi không có kỳ mới | `d0b02e0c` | phương án A: route ghi một lần bỏ `UNCONFIRMED`; `choice≠CANCEL` thiếu `nextPeriod` ⟹ 422 `NEXT_PERIOD_REQUIRED` (trừ `VENDOR_REFUSED` gói tháng) |
| A1C-04 `nextPeriod.startDate` | `e65fec67` | năm: `end` hoặc `end+1`; tháng: `end`; khác ⟹ 409 `PERIOD_REFUSED` `reason=NOT_ON_RENEWAL_DAY`; mutation bỏ kiểm ⟹ ca đỏ |
| R-1 gói tháng `endDate` xa không `renewalDate` | `56856684` | hàm dùng chung `firstGridOffsetFrom` ở `src/core/fiscal-year.ts` (catalog + purchase-invoice); cuộn hai chiều; 7 gói tháng kho trên VPS hết 409 `BEFORE_ADJUSTMENT_POINT` tới 24/12; unit catalog/licensing/requests/core 2842 xanh |
| R-2 flow phụ thuộc lịch | `157662f7` | Jira đặt `renewal_date = hôm nay+20`; đồng hồ giả 26/12: bản cũ đỏ 1/7, bản mới 7/7 xanh |
| O-2 một thuê bao lỗi dừng cả lượt quét | `ddf1fd03` | `try/catch` theo thuê bao, log chỉ id + loại lỗi (test khẳng định không lộ email), `SweepResult.failed`, job `warn` khi `failed>0` |
| O-7 khôi phục integration | `3f89fe76` | `subscription-renewal-sweep-routing.integration-spec.ts` 4 ca (IT phụ trách, khóa/nghỉ ⟹ rơi về phòng, kho không phòng, hạn chót suy ra); mutation định tuyến ⟹ 3/4 ca đỏ |
| A1C-05 (Optional) | `b3fb3797` | sự cố tự gia hạn cho mọi lựa chọn≠CANCEL khi mua nhiều seat hơn số đếm; integration ghim tập người nhận {Người duyệt chi, IT, Finance} |
| A1C-06 (Optional) | `2846f91d` | kỳ kế của kho không mang/không mua seat cho ghế hết đúng ngày gia hạn (dùng chung `carriedPast`, chuyển sang `assignment.policy.ts` vì `group-is-private`); 2 ca integration |

Mỗi commit đã chạy: typecheck, lint toàn bộ, `arch:check`, `rules:check`, `test:gates` (16 suite/335), `arch:docs:check`, unit licensing (732), integration file chạm, http-spec/flows khi chạm. **CI GitHub trên commit cuối `2846f91d`: xanh toàn bộ** ([run 44028374679](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44028374679): select, quality, e2e-smoke, http-contract, integration-inband, integration 1/2/3 đều success; Deploy bị skip). Cây làm việc sạch, `origin/feat/p5-a1-sbf20` = HEAD.

## D-n mới (cần Owner duyệt)

| Mã | Quyết định | Căn cứ |
| --- | --- | --- |
| D-21 (A1C-01) | `approvedAwaitingGrant` đếm theo Request (người hưởng): GRANT/SERVICE_ACCOUNT ở `AWAITING_EXECUTION` = 1; `GROUP_GRANT` theo dòng `APPROVED` khi `AWAITING_EXECUTION`/`EXECUTING`; Request tiếp tục (RENEWAL) không đếm (đã ở `pendingContinuations`) | khớp `grant-queue.repo.ts`; QĐ-103q |
| D-22 (A1C-02) | "Đang bị hủy" = `endingAmong` (gồm cả ca `DECIDED CANCEL` cũ ⟹ ca legacy ghi lại nhận `CANCELLED` thay vì `ALREADY_PROPOSED`); truy vấn ở `shared-pool-capacity.repo.ts` vì gate `capability-graph`; `stockOf/stockOfPlans` cũng loại thuê bao đã hủy (ngoài audit) | ít sửa nhất, không đợi 4b-4 |
| D-23 (A1C-03, **đổi hành vi so với spec §4.4 cũ**) | `UNCONFIRMED` không còn nhận ở route ghi một lần; mã mới `NEXT_PERIOD_REQUIRED` thay zod refine vì ngoại lệ gói tháng cần `commitment`; gói năm giờ luôn nối kỳ ⟹ lần ghi thứ hai nhận `NOT_RENEWABLE/ALREADY_CONTINUED` | audit phương án A |
| D-24 (A1C-04) | `NOT_ON_RENEWAL_DAY` là chuỗi tự do trong `details.reason` của mã `PERIOD_REFUSED` có sẵn (không thêm vào type `PeriodRefusal` của catalog) | tái dùng mã |
| D-25 (R-1) | `startDate` chỉ là cận dưới của lưới ngày thanh toán, KHÔNG làm neo (neo = `renewalDate ?? endDate`) ⟹ gói tháng chỉ có `startDate` vẫn không có điểm, nhưng cờ "kỳ chưa có hóa đơn" vẫn dựng lưới từ `startDate` (có test khóa); sửa một dòng ở `monthly()` nếu muốn neo cả `startDate` | spec §4.2 + `NO_ALERT_ANCHOR` |
| D-26 (R-1) | Gói tháng có `renewalDate` xa hơn một tháng nay cuộn lùi về lưới gần nhất (cùng luật hóa đơn), không lấy thẳng `renewalDate` | QĐ-106i(2) |
| D-27 (A1C-06) | Chỉ lọc khi kỳ kế là kho; kỳ kế do phòng sở hữu giữ hành vi cũ | đúng phạm vi brief |
| D-22 (sửa, V-3) | **Thay D-22 cho ca `DECIDED CANCEL` cũ:** POST và GET adjustment trả 409 `ALREADY_PROPOSED { renewalId }` (để IT ghi `/outcome` cho ca cũ), không còn `NOT_RENEWABLE/CANCELLED`; `NOT_RENEWABLE/CANCELLED` chỉ cho ca `OUTCOME_RECORDED CANCEL + AS_DECIDED`. `ALREADY_PROPOSED` nằm ở đúng bước 7 §4.4 (sau điểm/số lượng/`CANCEL_NOT_ALLOWED`) như mọi ca `DECIDED` cũ khác; sweep và đường cấp vẫn loại thuê bao đó (`endingAmong` không đổi) | spec §4.4 R2-1; điều phối chốt |
| D-28 (V-1, sửa D-25) | Cận dưới của lưới ngày thanh toán gói tháng là **ngặt**: `from = startDate >= today ? startDate + 1 ngày : today` (kỳ mới vừa ghi / gói vừa khai không mở điểm ngay ngày bắt đầu); cờ "kỳ chưa có hóa đơn" giữ `≥ startDate` | audit verify V-1 |
| D-29 (V-2) | `CANCEL` chỉ được thiếu `nextPeriod` khi `outcome = AS_DECIDED`; `CANCEL` + `VENDOR_REFUSED`/`DIFFERENT` thiếu kỳ mới ⟹ 422 `NEXT_PERIOD_REQUIRED` cho cả tháng lẫn năm (áp luôn cho `DIFFERENT`) | QĐ-106i(4); audit V-2 |
| D-30 (V-6) | Ghế của kho được lọc theo ngày gia hạn của kỳ cũ (`period.adjustment.end ?? startDate`), không theo `startDate` kỳ kế; kỳ cũ không có adjustment ⟹ giữ `startDate` | cùng định nghĩa `renewalOn` với phía ghi |

## FIX ĐỢT 3 (audit verify `AUDIT-A1-fix-verify.md`, 5 commit trên `2846f91d`)

| Mục | Commit | Kết quả |
| --- | --- | --- |
| V-1 lưới ngày thanh toán ngặt | `055df9c1` | unit 2 ca đỏ→xanh; integration: ghi REDUCE gói tháng ⟹ sweep không ALERT cho dòng mới, `adjustmentPointOn > hôm nay`; mutation `>=`/bỏ `addDays` ⟹ 2/7 ca unit đỏ |
| V-2 CANCEL + kết quả ≠ AS_DECIDED cần `nextPeriod` | `07882338` | unit ma trận 3×2; integration 422 không ghi dòng nào / 201 + sự cố tới {Người duyệt chi, IT, Finance}; mutation ⟹ 1 unit + 1 integration đỏ; spec tách `renewal-record-next-period.policy.spec.ts` (gate 400 dòng) |
| V-3 `DECIDED CANCEL` cũ ⟹ `ALREADY_PROPOSED` | `9eb6a6aa` | integration POST + GET 409 với `details.renewalId`; `OUTCOME_RECORDED CANCEL` vẫn `CANCELLED`; mutation ở service ghi và view mỗi cái 1/17 ca đỏ |
| V-4 (Optional) ghim lại fix A1C-02 ở sweep | `6f015e33` | `renewal_date = hôm nay+12` (lệch lưới); mutation bỏ `world.ending.has` ⟹ ca đỏ |
| V-6 (Optional) lệch một ngày kỳ năm `end+1` | `0222bab4` | `carriedPast(carried, period.adjustment?.end ?? startDate)`; integration: ghế hết `end+1`, kỳ kế `end+1` ⟹ mang và mua (đỏ trước khi sửa); kỳ kế `end` ⟹ không mua (giữ A1C-06) |

Lệnh ở HEAD `0222bab4`: typecheck, lint toàn bộ, `arch:check`, `rules:check`, `arch:docs:check`, `test:gates` 335/335, unit licensing 735, integration 13+7 file chạm xanh, http-spec renewals 72/72, flow edges 7/7.

Commit thứ 6 của đợt: `bc6d8da6` `fix(licensing): shorten the NEXT_PERIOD_REQUIRED message and list ALREADY_PROPOSED as reachable on the adjustment read (V-2, V-3)` — CI run [44035730514](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44035730514) (trên `0222bab4`) đỏ ở `http-contract` vì hai ví dụ OpenAPI do V-2/V-3 để sót: message `NEXT_PERIOD_REQUIRED` dài hơn 160 ký tự và `ALREADY_PROPOSED` thiếu trong danh sách mã reachable của `subscriptionRenewalAdjustmentGet` 409 (`test/support/openapi-example-route-codes-licensing.ts`). Sửa xong, `pnpm test:http` cho `openapi-response-examples` + `openapi-presentation` + `subscription-renewals` = 95/95.

**CI GitHub trên commit cuối `bc6d8da6`: xanh toàn bộ** ([run 44040686407](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44040686407): select, quality, e2e-smoke, http-contract, integration-inband, integration 1/2/3 success; Deploy skip). Lần chạy trước đó trên cùng commit ([run 44038318181](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44038318181)) đỏ một ca ở `integration (1)`: `test/integration/usage/vendor-import-confirm` ("two confirmations of the same import at once") nhận `[409, 409]` thay vì `[200, 409]` — test race ngoài phạm vi A1 (nhánh không chạm `src/modules/usage`), pass 3/3 ở local và xanh khi chạy lại CI ⟹ **nghi flake**, ghi vào "Nghi lỗi logic": nếu tái diễn, đây là ca race xác nhận import (usage), không phải SBF-20.

## Breaking FE bổ sung (đợt FIX)

- V-2: `POST /subscription-renewals` với `CANCEL` + `VENDOR_REFUSED`/`DIFFERENT` không `nextPeriod` ⟹ 422 `NEXT_PERIOD_REQUIRED` (trước: 201). V-3: ca `DECIDED CANCEL` cũ ⟹ 409 `ALREADY_PROPOSED` kèm `details.renewalId` (POST và GET adjustment). V-1: kỳ gói tháng mới ghi/mới khai có điểm điều chỉnh ở ngày thanh toán kế tiếp (sau ngày bắt đầu), không ngay ngày bắt đầu.

- `details.reason = CANCELLED` ở 409 `NOT_RENEWABLE` (POST ghi và GET adjustment); `PROVISIONING.SUBSCRIPTION_NOT_GRANTABLE`/`SUBSCRIPTION.NOT_FOUND` nay còn xảy ra khi thuê bao đã hủy; sweep không còn ALERT/KEPT lặp cho thuê bao đã hủy.
- Route ghi một lần: 422 `NEXT_PERIOD_REQUIRED` (RENEW/REDUCE/INCREASE thiếu `nextPeriod`, trừ `VENDOR_REFUSED` gói tháng; thay `OUTCOME_MISMATCH` ở ca `AS_DECIDED` thiếu `nextPeriod`); 422 `VALIDATION_ERROR` khi gửi `outcome=UNCONFIRMED` (FE bỏ lựa chọn "NCC chưa xác nhận" khỏi form ghi một lần); 409 `PERIOD_REFUSED` `details={reason:'NOT_ON_RENEWAL_DAY', renewalOn}` — FE mặc định `startDate = adjustment.renewalOn`.
- Gói tháng không có `renewalDate` (mọi gói tháng kho seed: Jira, Slack, GitHub, 1Password, Postman, Mailchimp, Canva): `alerts.baseDate`/điểm điều chỉnh theo ngày thanh toán gần nhất ≥ hôm nay (trước chỉ ở cuối kỳ); `GET adjustment` đổi `deadline`/`adjustmentPointOn` theo tháng; `alerts.dates` đổi theo tháng; sweep gửi `SUBSCRIPTION_RENEWAL_ALERT`/`KEPT` hằng tháng cho các gói này.
- Thông báo: `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` nay phát thêm cho RENEW/INCREASE khi kỳ ghi vượt số đếm (A1C-05); `SUBSCRIPTION_SEATS_INCREASED` ít hơn ở ca ghế hết đúng ngày gia hạn (A1C-06). Không mã thông báo mới.
- `approvedAwaitingGrant` (wire không đổi) nay đúng giá trị.

## 4b — ghi nhận, chưa làm trong P5 (đợt FIX)

- **O-1:** sweep dùng hai "hôm nay" (`sweep(now)` vs `businessToday(new Date())` ở catalog `withSuccessors`); gói tháng lệch kỳ khi chạy tay `sweep(now)` ngày khác hoặc lượt vắt qua nửa đêm. Sửa: `listAdjustmentSubjects(today)` nhận ngày từ sweep.
- **O-3 (R2-12):** `countFor` (2 SQL + 2 hook) vẫn chạy mỗi giờ suốt cửa sổ điểm điều chỉnh dù thông báo đã gửi. Sửa: bỏ ứng viên đã có eventKey trước khi `countFor`.
- **O-4:** không kiểm chéo `SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL` (1–90) ≤ `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL` (1–180); đặt đỏ > cửa sổ ⟹ `alerts.dates` hiện đỏ trước điểm. Sửa: luật chéo trong `validateParameterValue`.
- **O-5 (câu hỏi Owner):** dòng KEPT §4.5 không có điều kiện `autoRenew` — gói tháng `autoRenew=false` nhận "giữ nguyên N seat" đúng `endDate` rồi `EXPIRY_MARKED` hôm sau. Thêm `autoRenew` vào điều kiện KEPT là một dòng ở `renewal-adjustment-alerts.policy.ts` nếu Owner đồng ý.
- **O-6:** ca `DECIDED` cũ chặn mọi cảnh báo/sự kiện của thuê bao (mọi kỳ về sau), và cờ trễ đã gỡ; rủi ro thấp nếu seed lại VPS. Sửa: (a) chỉ tính `DECIDED` cũ khi `noticeBaseDate ≥ deadline − 1 năm`, hoặc (b) nhắc `_LATE` cho ca `DECIDED` quá `end`.
- **O-8:** giới hạn 500 theo `id` không cursor ⟹ thuê bao K2 thứ 501 không bao giờ được quét. Sửa: lọc SQL theo cửa sổ ngày trước `take`, hoặc cursor xoay vòng.
- **A1C-07:** `seats_needed` chưa nằm trong trigger "proposal is final" (R2-11); cần migration `…110300` `CREATE OR REPLACE FUNCTION`.
- **A1C-08:** `openRequestsOfPlan` đọc không khóa (cửa sổ race CANCEL với Request mới; Request mới đã bị chặn cấp nhờ A1C-02).
- **A1C-09 / A1C-10 / A1C-11 / A1C-12:** ca sự cố QĐ-106i(4) cũ vẫn assert `>=2` (ca mới của A1C-05 đã ghim tập người nhận); `lateRenewal` ca legacy tính theo luật mới; kiểm `ALREADY_PROPOSED` đặt sau số đếm; comment cũ "the one who confirms" ở `subscription-renewal-parties.service.ts:93`.
- **Nit N-1…N-3:** comment "no order" sai (`subscription-renewal-sweep.service.ts:43-44`, `security-jobs.md:178`); fixture `endsOnItsDate` dùng `kind:'END_DATE'` cho gói tháng; test tham số 14/45/10 không trả về mặc định (cần `finally` đóng giá trị).
- **Nghi lỗi logic (A1C-06):** kỳ kế do phòng sở hữu mà ghế hết đúng ngày gia hạn vẫn được mang hoặc bị `NEXT_PERIOD_SEATS`.
- **Nghi lỗi logic (A1C-01):** Request `SERVICE_ACCOUNT` ở `AWAITING_EXECUTION` đếm như 1 seat; chưa kiểm verdict `boundaryState = REJECTED` của IT có làm Request này không bao giờ được cấp (nếu có thì đếm thừa tạm thời).
- **V-5 (Optional, 4b-4):** hai chỗ đọc thuê bao "cấp được" chưa loại thuê bao đã hủy: `requests/purchase-invoice/purchase-invoice-plan.service.ts:187` (`poolSubscriptionOfPlan` — hóa đơn của Request K2 ghi vào thuê bao kho đã hủy) và `requests/spend-approval-view/spend-approval-snapshot.service.ts:108` (`annualVendorAmountOf`). Hết khi catalog ghi *đã đóng* (4b-4); tạm thời có thể đi qua facade licensing `grantableOf`.
- **V-7 (Nit):** D-21 còn đếm Request `SERVICE_ACCOUNT` (QĐ-110m đã bỏ loại này, chỉ còn ảnh hưởng dòng cũ); nhánh `GROUP_GRANT` của `approvedAwaitingGrant` chỉ có unit test; ca sweep "tells nothing once the IT Admin has recorded the period" nay ghi kèm `nextPeriod` nên không còn chạm nhánh `hasCase` của gói năm (chỉ phủ ở unit `renewal-adjustment-alerts.policy.spec`).
- **Hạ tầng test (điều phối lưu ý):** trong đợt R-1 subagent chạy `docker desktop restart` (Docker treo do quá tải) nên DB tmpfs `slm-p5-a1` mất và đã dựng lại; `slm-p5-b` (35443), `slm-p5-c` (35444) bị restart cùng và có thể mất role `ci_integration` (chưa tự kiểm). Tôi không đụng tới hai DB đó.
