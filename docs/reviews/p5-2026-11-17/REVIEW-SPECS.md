# REVIEW-SPECS — review độc lập 4 spec prompt 5 (16/11/2026)

Chỉ đọc. BE `dev` @ `94a8ee84`, nhánh AI `origin/Bao_dev_be` @ `501c3c08` (đọc bằng `git show`). Luật: sổ QĐ (947 dòng), BRD v4.13,
`SBF-07a/08/20.md`, `US-09-04`.

**Skill đã đọc/dùng:**
- `agent-skills:spec-driven-development` (process): đối chiếu từng spec với khung spec, điều kiện xong, ranh giới.
- `agent-skills:code-review-and-quality` (review): phân mức Critical / Required / Optional, rủi ro kiến trúc.
- `superpowers:verification-before-completion` (verification): mọi kết luận dưới đây đều có lệnh đọc code hoặc nguồn chạy trong lượt này.

## 1. Kiểm trích dẫn (49 mẫu)

| Spec | Số mẫu | Đúng | Lệch |
| --- | --- | --- | --- |
| 5A-SBF20 | 16 | 16 | Không có (gồm `subscription-period.service.ts:35-40,170,266`, `subscription-period.types.ts:19`, controller `:128,:277`, `adjustmentPointOf` `:116-173`, `renewal-proposal.policy.ts:19-37`, sweep `:47-52`, seat repo `:36`, `licensing.extension-points.ts:145-160`, `assignment.service.ts:397`, `assignment.repo.ts:220`, `parameter-definitions.policy.ts:303`, tên index ở `20261108300100`, trigger một chiều) |
| 5A-FIXES | 15 | 14 | `inbox.policy.ts:28-212`, thực tế là `:29-213` |
| 5B | 12 | 8 | `notifications.types.ts:47-211`, thực tế `:50-211`. `refuseInAppNotification` ghi `:228`, thực tế `:225`. `decision-routing.service.ts:161-170` không có `?? ''`. `decision-reminder.service.ts:74,129`, thực tế `:64,132`. "11 nơi gọi `parseMoney`" / "8 file", thực tế 10 lời gọi trong 7 file. Số 118 mã thông báo đúng. |
| 5C | 6 | 6 | Không có (`queue-summary.service.ts:79-81,196-204,295-303`, `invocation.repo.ts:71-90,146-156,166-188`, migration `20261109100000_ai_provider_mode`, `merged-migrations.txt` 113 dòng, `maxItems: 22` ở `:81`, 29 khóa tham số) |

Kết luận: trích dẫn tin được. Phần lệch đều nhỏ, không đổi kết luận của spec.

## 2. Bảng phát hiện

| ID | Spec | Mức | Vấn đề | Đề xuất sửa |
| --- | --- | --- | --- | --- |
| X-1 | Cả 4 | **Critical** (chặn kế hoạch) | Tổng giờ theo spec là 4,25 + 9,5 + 13,2 + 9,25 ≈ **36 h**. Brief đặt ~10 h. Kể cả khi chỉ làm phần lõi của từng spec vẫn ≈ 23 h. Riêng 5a (SBF-20 + FIXES) đã ≈ 13,75 h. | Owner chốt lại phạm vi **trước khi** mở chat code. Xem §5. |
| X-2 | S20 ↔ FIXES | Required | Cả hai spec đều ghi là "chat 5a". FIXES lại coi SBF-20 là "agent khác" (`[S20]`, T10 "rebase lên SBF-20"). Chưa có thứ tự chung, và hai spec dùng trùng mã task T1–T8. | Một chat 5a làm theo thứ tự ở §4. Đổi mã task thành `S20-T*` / `FX-T*`. |
| S20-1 | SBF20 | Required | Spec coi 7/30/7 là hằng số và dẫn `QĐ-111o`. Nhưng `QĐ-111o` chỉ nói về danh sách *gần hết hạn*. BRD `FR-8.2` (bảng mặc định, bản 4.12 đã áp `QĐ-111`), `QĐ-103n` và `SBF-20.md` bước 2 đều ghi điểm điều chỉnh và cảnh báo đỏ là **tham số `FR-8.2`**. | Bỏ khỏi mục "Đã tự quyết". Hỏi Owner, hai phương án: **A** giữ hằng số ở 5a (catalog đang dùng hằng số), ghi lệch luật, mở hạng mục 4b thay `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` bằng 3 tham số (áp theo `QĐ-106h`); **B** làm ngay. |
| S20-2 | SBF20 | Required | Trả 403 `NOT_RESPONSIBLE_IT_ADMIN` khi IT Admin khác ghi kết quả trong lúc người phụ trách vẫn dùng được. Điều này trái nguyên tắc "IT Admin khác được xử lý thay các thao tác ghi, có Audit Trail" (BRD dòng 361 và 678, `QĐ-58b`). `FR-1.12`(4) và `QĐ-104l` chỉ nêu ai chịu trách nhiệm, không cấm người khác làm thay. | Mọi IT Admin đều ghi được. Audit ghi `substitute: true` + `responsibleItAdminEmployeeId`. Thông báo vẫn gửi người phụ trách. Bỏ mã 403. Nếu muốn giữ chặn thì đưa thành câu hỏi Owner. |
| S20-3 | SBF20 | Required | Điều kiện được `CANCEL` chỉ là `target = 0`. `QĐ-103e`, `FR-1.12`(4)(10) và `QĐ-99i` đòi "không còn quyền đang gán **và Request nào**". Công thức `seatsNeeded` bỏ sót hai trường hợp: (a) quyền còn hiệu lực hôm nay nhưng kết thúc trước ngày gia hạn; (b) Request chưa duyệt (đang ở bước nhu cầu hoặc duyệt chi) cho cùng gói. | Thêm điều kiện "không có Request mở cho plan" (qua hook của `requests`). Ghi rõ `closure` chỉ xác nhận khi quyền đã về 0, hoặc tách đóng thuê bao thành bước sau ngày gia hạn (đi cùng Q2). |
| S20-4 | SBF20 | Required | `SUBSCRIPTION_RENEWAL_ALERT` đổi params: thêm `renewalOn`, `seatsNeeded`, `commitment`; dòng mới không còn `milestoneDays`/`audience`. Có 3 mã mới và `renewalId` cho `AUTO_RENEWAL_INCIDENT`. Spec không có dòng catalog (VI/EN, người nhận, `target`) cho 5b, và không đưa thay đổi params vào danh sách breaking FE. | Thêm mục "Thông báo mới/đổi cho 5b" theo khuôn D4 của 5b. Giữ khóa cũ trong `PARAM_KEYS_BY_CODE` để dòng cũ vẫn đọc được. |
| S20-5 | SBF20 | Required | Trạng thái *hết hạn chưa gia hạn* chỉ xét gói năm. Gói tháng không tự gia hạn và có `endDate` (`monthly()` trả `endDate`) qua ngày đó mà còn quyền thì không có `EXPIRY_MARKED`, trái `QĐ-103e` và `FR-1.12`(11). | Dòng "Qua ngày gia hạn" áp cho mọi kỳ có `end` thật (không cuộn): gói năm, và gói tháng có `autoRenew = false`. |
| S20-6 | SBF20 | Required | Catalog vẫn đọc `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` (`subscription-view.service.ts:318`, `subscription-notice.service.ts:38`). Sau 5a, `alertDates` trên FE (15/7) sẽ lệch với cảnh báo thật (7/30/7). Việc này đang để ở 4b-6. | Đưa 4b-6 vào 5a (catalog lấy ngày từ `adjustmentPointOf`, khoảng 0,3 h). Nếu không, ghi là gap đã biết trong breaking FE. |
| S20-7 | SBF20 | Optional | `KEPT` chỉ phát khi `today = deadline`. Kỳ của gói tháng cuộn ngay sau ngày thanh toán, nên job lỡ đúng ngày đó (deploy hoặc ngừng chạy) là mất nhắc. | Cho phép trong cửa sổ `deadline ≤ today ≤ deadline + 2`, eventKey giữ nguyên để không nhắc trùng. |
| S20-8 | SBF20 | Optional | Ca "lỡ điểm + nhà cung cấp tự gia hạn" có báo Người duyệt chi. `QĐ-106i`(4) và `FR-1.12`(13) chỉ gọi là *sự cố* khi IT **đã ghi giảm/hủy**. Còn `QĐ-99h` và `QĐ-103n` lại gọi lỡ điểm là "ngoài ý muốn". | Hỏi Owner, hoặc giữ cách hiện tại nhưng ghi nguồn. |
| S20-9 | SBF20 | Optional | Cảnh báo `NO_NOTICE_DEADLINE` chỉ cho `kind = RENEWAL_DATE`. Ca `END_DATE` (không có hạn chót, không có số ngày báo trước) cũng là "thiếu hạn chót" theo `FR-1.12`(13). | Thêm cảnh báo, hoặc ghi lý do (`QĐ-62l`). |
| S20-10 | SBF20 | Optional | Ca `DECIDED` cũ có `notice_base_date` khác `adjustment.deadline`, nên index mới `(subscription_id, notice_base_date)` cho phép thêm ca sống thứ hai, và sweep có thể báo đỏ cho kỳ đã có ca. | `POST` và sweep coi mọi ca `DECIDED` cũ của thuê bao là "ca của kỳ". |
| S20-11 | SBF20 | Required (giờ) | T4 1,1 h (gộp 3 bước, xóa 4 file, viết lại http-spec, OpenAPI) và T6 0,7 h là thấp. Thực tế khoảng 2 h và 1,2 h. | Ước lại ≈ 5,5 h. |
| FX-1 | FIXES | Required | T10 thiếu cập nhật số đếm ở 3 chỗ: `parameter-definitions.policy.spec.ts:160` ("twenty-nine"), `operating-parameters-http.integration-spec.ts:428` (`toBe(29)`), `api-collection-registry-exceptions.ts:81` (`maxItems: 22`, vốn đã sai). | Thêm 3 file vào T10. Số đích tính từ `PARAMETER_DEFINITIONS` lúc merge: 27 nếu chưa có 5c, 28 nếu đã có. |
| FX-2 | FIXES | Required | `DEVICE_STOP_REQUESTED`/`_OVERDUE` chưa có params, subject, eventKey (B5–B7 thì đủ). | params `stopRequestId, registrationId, deviceId, holderEmployeeId, dueAt`; subject `{DEVICE_STOP_REQUEST, id}`; eventKey `DEVICE_STOP_REQUESTED:{id}` / `DEVICE_STOP_REQUEST_OVERDUE:{id}`. |
| FX-3 | FIXES | Required | CHECK `device_stop_requests_outcome` (`20261107000000/migration.sql:169-173`) bắt dòng `INVALID` phải có `handled_at`. Spec không nói phải đặt cho `DUPLICATE`/`ALREADY_STOPPED`/`REGISTRATION_ENDED`. Ngoài ra đã có unique `device_stop_requests_one_open` (`:174`). | Đặt `handled_at = now`. Bắt `23505` ⟹ `DUPLICATE` khi hai yêu cầu chạy đua. |
| FX-4 | FIXES | Optional | `US-09-04` AC-6 ("chỉ đóng được yêu cầu không hợp lệ và phải nhập lý do"), cùng enum `IT_ADMIN` và CHECK `invalid_note`, cho thấy nguồn có dự kiến IT đóng không hợp lệ. Spec bỏ ý này. US ghi hạn "cấu hình được", spec để hằng số 2. | Ghi rõ là lệch có chủ ý (BRD `FR-8.2` không liệt kê tham số này), hoặc thêm route nhỏ. |
| FX-5 | FIXES | Required | Q-5A-1 khuyến nghị A (mỗi Request một thông báo; lô 20 mục ⟹ 20 thông báo). Điều này trái chữ của `QĐ-99h` ("Người duyệt chi chỉ nhận thông báo ngay khi cần quyết (lô duyệt chi …)") và BRD 5.5.4. | Đổi khuyến nghị sang B (một thông báo mỗi lô, +0,4 h). |
| FX-6 | FIXES | Optional | A2: lỗi DB tạm thời đổi thành 503 trong filter sẽ không còn log nguyên nhân (hiện `createEnvelope` chỉ log lỗi không phải `HttpException`). | Log cảnh báo kèm `requestId` trước khi đổi. |
| FX-7 | FIXES | Optional | B6/B7 dùng `vendorId`, nhưng 5b không có `NameKind` VENDOR, nên câu thông báo sẽ không có tên nhà cung cấp. | Thêm kind VENDOR (catalog), hoặc chấp nhận câu không có tên. |
| 5B-1 | 5B | Required | N5 gợi ý "đặt provider `NotificationNameContributions` ở module chỉ graph API dùng". Làm vậy thì listener của `organization`/`catalog`/`requests` lỗi DI khi boot ở graph worker/CLI. Mẫu đúng là `DepartmentUseContributions` (`organization.module.ts:24,43`). | Provide + export point ở `NotificationsModule`. Chỉ đặt **người dùng** (`InboxViewService`) ở `notifications-http.module.ts`, khi đó gate `extension-wiring` không cần ngoại lệ. |
| 5B-2 | 5B | Required | Luật mới `SUBJECT_INVALID` làm `notifyInApp`/`deliver` ném `InvalidInAppNotificationError` (`inbox.service.ts:24-25`, `held-notification.service.ts:27-28`) ngay trong transaction nghiệp vụ. Chỉ cần sót một nơi ghi, hoặc còn hàng giữ cũ lúc `deliverToHead` bàn giao, là thao tác nghiệp vụ / đổi trưởng phòng trả 500. | Ở đường ghi: chuẩn hóa bằng `canonicalSubjectType` thay vì ném. Chặn tái phát bằng test hoặc gate quét `subject: { type:`. |
| 5B-3 | 5B | Required | D4 chỉ phủ "mã 5a **thêm**". A8 #19 ("không cần, đã có `milestoneDays`") sẽ sai sau SBF-20 (S20-4). | D4 phủ cả mã bị đổi params. N3b viết lại mẫu câu `SUBSCRIPTION_RENEWAL_ALERT`, đặt khóa cũ trong `[ ]`. |
| 5B-4 | 5B | Required | Phần C (breaking) còn thiếu: DTO tax-profile siết lại (≤ 20 dòng, `taxType` ≤ 100 ⟹ 422 mới), xóa giá trị enum ở response (E8b A1, `applicationList.emptyState`), thêm `recipientRole`. | Thêm vào `changes/<ngày>-prompt5.md`. |
| 5B-5 | 5B | Optional | Bốn file nhóm câu không có chỗ cho mã usage/devices mới của 5a. Sau 5a + SBF-20 tổng là **128** mã, không phải 118. | Nêu file đích (ví dụ `notification-texts-usage.types.ts`), mỗi file ≤ 500 dòng. |
| 5B-6 | 5B | Required (giờ) | N3a + N3b (chép ~128 mã × 2 ngôn ngữ + nhãn) chỉ được 1,5 h, thấp. Thực tế khoảng 2,5–3 h. | Chốt P5B-Q1 trước khi chạy. |
| 5B-7 | 5B | Optional | Hai chỗ chưa rõ: (1) E2b đụng `out-of-process-case-closure.service.ts`, file mà FX-T5 cũng sửa, nhưng D3 không ghi. (2) "Dọn tham số chết": 5b hiểu là khóa params của thông báo, 5a hiểu là tham số vận hành ZBB. | Ghi file vào D3. Ghi rõ khóa params chết thuộc 4b. |
| 5C-1 | 5C | Required | Đổi tên migration theo "timestamp lúc tạo commit merge". Nếu 5a merge sau 5c thì 2 migration của SBF-20 và T10 phải lớn hơn migration của 5c; nếu không sẽ vi phạm `DB-15`. | Cấp trước dải timestamp theo thứ tự merge (§4). Bên merge sau đổi tên. |
| 5C-2 | 5C | Optional | A8.4 ghi "diff `openapi.json` so `dev` chỉ có …". Câu này chỉ đúng nếu 5c merge trước 5a/5b. | Sửa thành "so nhánh đích lúc merge, phần do 5c". |
| 5C-3 | 5C | Optional | Đã chạy `git merge-tree --write-tree`, lệnh ghi object vào repo, trái brief. Spec đã khai. | Không lặp lại. Không cần sửa gì thêm. |

Phần đã khớp luật, không cần sửa:
- SBF-20: một lần ghi, không qua trưởng phòng hay Người duyệt chi; báo Finance; báo đỏ IT + Finance; `K1`/`K4`/`K5` không có điểm điều chỉnh; không có seat đệm; mức tối thiểu nhà cung cấp kèm bằng chứng; `CANCEL` không gọi `SBF-18`.
- Thông báo mới của FIXES khớp `QĐ-108f`, `SBF-07a` §5.1, `SBF-08` bước 4.
- Dừng thu thập khớp `FR-4.18`, `QĐ-101a/g`, `QĐ-66ae`, kể cả lỗi mốc `COALESCE`.
- `QĐ-111ax`.
- 5c khớp `QĐ-79c`, `QĐ-102b/f/h`.
- Kiến trúc: tầng module đúng (usage T6 → devices T5; requests/catalog/organization → notifications T1). Có `_values` riêng cho `ADD VALUE`. Không có model mới, nên không phải sửa `PRISMA_MODEL_OWNER` (`DeviceStopRequest` → devices đã có). Port AI không thêm bảng.

## 3. Mâu thuẫn giữa các spec

1. **Ai làm SBF-20, thứ tự thế nào** (X-2): SBF-20 ghi "chat 5a"; FIXES ghi "agent khác", T10 "rebase lên SBF-20". Hai bên trùng mã T1–T8.
2. **Hai file thông báo** `notifications.types.ts` và `inbox.policy.ts` bị 3 nơi sửa: S20-T4/T6, FX-T4a/T5/T9c, 5b-N4/N7. 5b phải chạy sau cả hai phần của 5a.
3. **Bàn giao câu thông báo**: 5b D4 đòi đủ dòng catalog. FIXES chỉ đưa tiêu đề VI/EN cho 7 mã, chưa có câu `message` và chưa có params của `DEVICE_STOP_*`. SBF-20 không đưa gì cho 3 mã mới và 1 mã đổi params.
4. **Số tham số vận hành**:
   - FIXES: 29 → 27.
   - 5c: 29 → 30, hoặc 28 nếu 5a đã merge.
   - FIXES quên 3 chỗ phải sửa số (FX-1).
5. **Thứ tự migration**: SBF-20 có 2 migration (`_values` rồi `_rules`), FIXES-T10 một migration dữ liệu, 5c đổi tên `ai_provider_mode`. Cả bốn phải lớn hơn `20261113102700`; riêng 5c phải lớn hơn `20261116100000`.
6. **`RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`**: FIXES ghi xung đột `[S20]` ở `parameter-definitions.policy.ts`, nhưng SBF-20 không xóa định nghĩa này. Xung đột đó là ảo. Lệch thật là catalog vẫn đọc tham số (S20-6).
7. **`SUBSCRIPTION_RENEWAL_ALERT`**: 5b A8 #19 dựa trên `milestoneDays`, còn SBF-20 đổi params (5B-3).
8. **Mapper lỗi dùng chung**:
   - `spend.http-errors.ts`: FX-T1 + 5b-E7a/E3b.
   - `account.http-errors.ts`: FX-T7 + 5b-E7b.
   - `out-of-process-case-closure.service.ts`: FX-T5 + 5b-E2b.

   Chạy tuần tự là không va. Riêng file thứ ba chưa được ghi ở D3 của 5b.
9. **Nghĩa của "dọn tham số chết"**: 5a hiểu là tham số vận hành ZBB; 5b (A8 #7) hiểu là khóa params của thông báo.
10. Những chỗ đã khớp, không phải mâu thuẫn:
    - 5b để lỗi `AI.*` ở P2, đúng như 5c yêu cầu.
    - 5b không đụng route SBF-20; `subscriptionRenewalDecide` bị SBF-20 gỡ.
    - 5b không sửa filter mà FX-T2 sửa.

## 4. Thứ tự merge đề xuất

Cấp trước timestamp migration theo thứ tự merge. Bên nào merge sau mà tên nhỏ hơn thì đổi tên trước khi merge.

| Thứ tự | Nhánh / phần | Migration | Ghi chú |
| --- | --- | --- | --- |
| 1 | **5a**, một nhánh, thứ tự trong chat: FX-T1 → T2 → T7 → T3a → T3b → **S20-T1…T8** → FX-T8 → T6a–c → T4a → T4b → T5 → T9a–c → T10 → T11 | `20261117100000_licensing_renewal_adjustment_values`, `20261117100100_licensing_renewal_adjustment_rules`, `20261117100200_drop_zbb_parameters` | Sửa lỗi 500/503 trước. Gom các task thêm mã thông báo vào cuối để 5b chỉ phải rebase một lần. |
| 2 | **5c** (`feat/p5c-ai`), rebase lên dev sau 5a | `20261117100300_ai_provider_mode` (đổi tên) | Số tham số = 28 ở 4 chỗ. Sinh lại `openapi.json`. Phần repo AI (S1–S6) độc lập, merge lúc nào cũng được. |
| 3 | **5b**, rebase sau 5a + 5c | không có | `satisfies Record<InAppNotificationCode, …>` bắt đủ 128 mã. Sinh lại OpenAPI và `docs/generated`. |

Nếu 5c xong trước 5a: merge 5c trước với `20261117100000_ai_provider_mode`, khi đó 3 migration của 5a dịch lên `…100100`–`…100300`. Sau mỗi
lần merge chạy đủ job `ci.yml`.

## 5. Breaking FE còn thiếu và ước lượng giờ

**Breaking FE chưa được liệt kê:**
- SBF-20: params của `SUBSCRIPTION_RENEWAL_ALERT`; ca `PROPOSED` cũ thành `STALE`; `subscriptionDeadlineEventList` đổi nghĩa (theo ngày gia hạn, có thêm Finance); `NOT_RENEWABLE.details.reason`; `alertDates` của catalog lệch.
- FIXES: các list usage/ghost seat của IT nay lọc theo phòng (trang có thể rỗng, `ghostSeatRecommendationGet` trả 404); `spendBatch` `reason` thêm `COMMITMENT_NOT_HOLDABLE`; 500 → 503; `aiUsageBatchCreate` đổi nghĩa từng ngày (ngày trước bị từ chối nay được nhận).
- 5b: xem 5B-4.
- 5c: chỉ thêm field, đủ.

**Ước lượng giờ:**

| Spec | Theo spec | Ước của review | Lõi tối thiểu (review) |
| --- | --- | --- | --- |
| 5A-SBF20 | 4,25 | ~5,5 | S20-T1–T5, T7 ≈ 4,5 |
| 5A-FIXES | 9,5 | ~10,5 | T1, T2, T7, T9a, T9b ≈ 3,5 |
| 5B | 13,2 (A: 8,8) | ~15 (A: ~10) | N1, N2, N3, N6 + E1, E7 ≈ 6 (tên trong câu dùng cụm chung, `target: null`) |
| 5C | 9,25 (gọn 5,5) | ~9,5 | C1–C4 ≈ 4,5 (chạy song song) |
| **Tổng** | **≈ 36** | **≈ 40** | **≈ 18,5** (đường dài nhất 5a → 5b ≈ 14) |

Mục tiêu ~10 h không đạt được nếu giữ cả SBF-20 lẫn chữ thông báo. Owner chọn một trong hai:
- **A** (khuyến nghị): prompt 5 làm theo cột "lõi tối thiểu". Phần còn lại của FIXES (T3, T4, T5, T6, T8, T9c, T10) và 5b (N5, target, E2–E8) chuyển sang 4b.
- **B**: chấp nhận khoảng 18–20 h.
