# Spec: điều khoản nhà cung cấp, checklist sáu điểm và cảnh báo rà soát (`US-04-11`)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-1.10`, `FR-1.4`, `FR-2.11`, `FR-5.14`, `QĐ-54e`, `QĐ-62l`, `QĐ-66al`, `QĐ-75`; `US-04-11` AC-1→AC-4, AC-6→AC-9 trong `BE-UserStory/src/EP-04.md`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin ghi cho từng gói (trừ K5) liên kết điều khoản, ngày rà soát gần nhất và checklist sáu điểm **đúng như điều IT đọc được**, ghi ý kiến không chặn của Business Owner, và thấy cảnh báo _điều khoản cần rà soát lại_ khi tới mốc trước hạn chót báo hủy của thuê bao (neo ngày kết thúc khi thuê bao không có hạn chót, không có khi là khoản mua vĩnh viễn); cảnh báo đóng khi IT cập nhật ngày rà soát. Hệ thống không diễn giải pháp lý, không có trường kết luận hợp pháp.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: điều khoản của gói và cảnh báo rà soát do IT Admin giữ; chủ là capability `catalog/plan-terms`.
- Boundaries: bảng `plan_terms` (một dòng mỗi gói) và `plan_term_opinions` (chỉ thêm) của `catalog`; route `/plans/{id}/terms`, `/plans/{id}/term-opinions`, `/plan-warnings`; cảnh báo **suy ra khi đọc** từ thuê bao đang hoạt động (contract `SubscriptionNoticeService` của capability `subscription/`) và ngày rà soát — không bảng cảnh báo, không gửi gì; một giao dịch mỗi lệnh ghi cùng Audit Trail.
- Not larger: cảnh báo _vi phạm điều khoản_ về số thiết bị trên một khóa K4 (AC-10) cần khóa bản quyền gắn thiết bị — `g4-device-dependent-features`; gửi cảnh báo qua kênh (`US-11-01`, `US-12-15`).
- Not smaller: điều khoản, ngày rà soát, ý kiến và cảnh báo suy ra chung một mốc tính và một quyền; thiếu ngày rà soát thì AC-3, AC-4 không kiểm chứng được.
- Siblings: `g3-plan-declaration` (xong), `g3-subscription-purchase` (xong), `g4-device-dependent-features` (khung bị chặn).
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC                   | Coverage | Phần còn lại thuộc                    |
| -------- | -------------------- | -------- | ------------------------------------- |
| US-04-11 | AC-1→AC-4, AC-6→AC-9 | partial  | AC-10: `g4-device-dependent-features` |

AC-5 bị bỏ trong nguồn (không còn tài khoản dùng chung, `QĐ-75`). Mệnh đề _cảnh báo vi phạm vẫn áp_ của AC-9 (khoản mua vĩnh viễn) thuộc cơ chế cảnh báo vi phạm của `g4-device-dependent-features`; lát này làm vế _không có cảnh báo rà soát theo mốc cho khoản mua vĩnh viễn_.

## Supporting references

`FR-1.10`, `FR-1.4`, `FR-2.11`, `FR-5.14`, `QĐ-54e`, `QĐ-62l`, `QĐ-66al`, `QĐ-75`, `OQ-B-10`, `OQ-B-11a`, `OQ-B-11b`, `OQ-B-14`, [ADR-0013](../../../decisions/0013-catalog-finance-licensing-contexts.md).

## Explicit out of scope

- Cảnh báo _vi phạm điều khoản_ và đếm thiết bị trên khóa (AC-10, `QĐ-66al`): cột số `install_limit_max_devices` có từ lát này (gói K4 lưu dạng số) nhưng không có cơ chế kiểm; `g4-device-dependent-features` thêm.
- Gửi cảnh báo qua kênh, mốc nhắc lặp (`US-11-01`, `US-12-15`); diễn giải pháp lý, tra cứu hợp đồng bằng AI; tự thu hồi khi vi phạm.
- Sửa `sharingPolicy` ở đây: điểm (1) _chính sách chia sẻ_ là cột của gói đã có từ `g3-plan-declaration` (`PATCH /plans/{id}`), **một nơi duy nhất** để nhập (`US-04-02`); route điều khoản chỉ hiện lại giá trị đó.
- Người duyệt chi đọc điều khoản khi quyết (`BM-02`, gia hạn): thuộc Story của họ (G5/G6); ở đây đọc là `IT_ADMIN` và `FINANCE`.

## Dependencies and blockers

`g3-plan-declaration` (bảng `plans`, `PlanLookupService`), `g3-subscription-purchase` (thuê bao, `deriveNotice`, tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`); `OrganizationService.businessToday`; `AuditService`. Không blocker.

## Ownership: module, data, API

- Module `catalog`: capability mới `plan-terms/` (controller, service, repo của hai bảng, DTO, lỗi, type, hàm thuần `plan-terms.policy.ts`, ánh xạ lỗi HTTP); contract nội module `subscription/subscription-notice.service.ts` (thuê bao kỳ đang hoạt động kèm mốc báo hủy suy ra) và mở rộng `plan/plan-lookup.service.ts` (thêm ứng dụng, chính sách chia sẻ, Business Owner của ứng dụng).
- Dữ liệu: `plan_terms`, `plan_term_opinions`; `PRISMA_MODEL_OWNER`: `PlanTerms`, `PlanTermOpinion` → `catalog`.
- API (ghi `IT_ADMIN`, đọc `IT_ADMIN`, trừ `FINANCE` đọc điều khoản): `GET/PUT /plans/{id}/terms` (`GET` cả `FINANCE`), `POST /plans/{id}/term-opinions` (`IT_ADMIN`), `GET /plan-warnings` (`IT_ADMIN`) — bốn operation.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                         | Kết luận                                                                                                                                                                                                                                                                                                                                                                                                             | Nguồn / loại           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Điều khoản lưu gì                           | `termsUrl` (liên kết `http`/`https`, ≤ 2000 ký tự), `lastReviewedOn` (ngày, không ở tương lai), năm điểm viết tay (2 `aiTraining`, 3 `dataLocation`, 5 `commercialUse`, 6 `cancellationRefund` là văn bản ≤ 2000 ký tự; 4 `installLimit`) và điểm 1 chính sách chia sẻ (cột của gói). Mọi điểm là **điều IT đọc được**; mọi trường tùy chọn, `PUT` thay toàn bộ, lưu dở được (`OQ-B-10`: không bắt buộc đủ sáu điểm) | AC-1; `OQ-B-10`        |
| Không diễn giải pháp lý                     | Văn bản lưu **nguyên văn** (chỉ chuẩn hóa khoảng trắng); không có trường hay thao tác kết luận hợp pháp/vi phạm; DTO `strict` không nhận trường nào khác; CSDL không có cột nào mang nghĩa kết luận (test chặn tên cột)                                                                                                                                                                                              | AC-2                   |
| Giới hạn cài đặt (điểm 4)                   | `installLimit: { maxDevicesPerKey?, note? }`: số (≥ 1) **chỉ cho gói K4** (422 `PLAN_TERMS.INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4`), văn bản cho mọi gói (`QĐ-66al`); hệ thống chỉ lưu và hiện, không đếm thiết bị                                                                                                                                                                                                        | `QĐ-66al`              |
| Gói K5                                      | Không có điều khoản: `GET` trả `applicable = false` không lỗi; `PUT` ⟹ 422 `PLAN_TERMS.NOT_APPLICABLE`; không bao giờ có cảnh báo rà soát (K5 không có thuê bao)                                                                                                                                                                                                                                                     | AC-7                   |
| Ý kiến Business Owner                       | `POST /plans/{id}/term-opinions { opinion }` (1–2000 ký tự) ghi một dòng **chỉ thêm** gồm Business Owner **hiện tại của ứng dụng**, người ghi (IT Admin) và thời điểm; không bước, SLA, người duyệt hay thông báo nào được thêm; bất biến bằng CSDL                                                                                                                                                                  | AC-6                   |
| Mốc cảnh báo rà soát (`OQ-B-11a`)           | Với mỗi **thuê bao kỳ đang hoạt động** có ngày gốc (`deadline` đã khai/suy ra, hoặc ngày kết thúc khi `BY_END_DATE`): mốc rà soát = **ngày cảnh báo sớm nhất** của thuê bao (ngày gốc trừ số ngày lớn nhất của `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, mặc định 15); một tham số cấu hình điều khiển cả hai. _Quyết định thiết kế cho Owner xác nhận_                                                                  | AC-3, AC-9; `OQ-B-11a` |
| Khi nào cảnh báo mở và đóng                 | `TERMS_REVIEW_DUE` mở khi **hôm nay** nằm trong `[mốc rà soát, ngày gốc]` **và** gói chưa rà soát cho kỳ này: `lastReviewedOn` rỗng hoặc trước mốc rà soát. Cập nhật `lastReviewedOn` ≥ mốc ⟹ cảnh báo kỳ này đóng (suy ra, nên không gửi lặp). Hết ngày gốc thì ngoài cửa sổ. Thuê bao nháp không tính                                                                                                              | AC-3, AC-4; `OQ-B-11a` |
| Không hạn chót báo hủy; khoản mua vĩnh viễn | Thuê bao không hạn chót nhưng có ngày kết thúc và không tự gia hạn ⟹ neo ngày kết thúc, cảnh báo mang `noticeDeadline.source = BY_END_DATE` (_theo ngày kết thúc_); thuê bao `MISSING` (không có ngày nào) ⟹ không cảnh báo (đã có cảnh báo chất lượng dữ liệu của thuê bao); khoản mua **vĩnh viễn** ⟹ không cảnh báo rà soát                                                                                       | AC-9; `OQ-B-11b`       |
| Người nhận cảnh báo (`OQ-B-14`)             | `GET /plan-warnings` do `IT_ADMIN` đọc; ở lát này mọi IT Admin thấy như nhau (chưa lọc theo phòng — gói không gắn phòng cụ thể)                                                                                                                                                                                                                                                                                      | `OQ-B-14`              |
| Quyền                                       | Ghi điều khoản và ý kiến: chỉ `IT_ADMIN`. Đọc điều khoản: `IT_ADMIN`, `FINANCE`. Đọc cảnh báo: `IT_ADMIN`. Finance (ghi), trưởng phòng, Employee, Người duyệt chi, Super Admin bị 403                                                                                                                                                                                                                                | AC-8                   |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-T1 | `plan-terms.policy.ts` thuần: `cleanTermsText` (chuẩn hóa khoảng trắng, ≤ 2000), `cleanTermsUrl` (`http`/`https` tuyệt đối), `assertInstallLimit(kind)`, `reviewDue({ today, lastReviewedOn, baseDate, firstAlertDate })`. Mỗi quy tắc có test đơn vị, gồm biên mốc và ngày gốc     |
| T-T2 | `SubscriptionNoticeService` (contract của `subscription/`) trả thuê bao `TERM` + `ACTIVE` có ngày gốc: `{ subscriptionId, planId, noticeDeadline, noticeSource, baseDate, firstAlertDate }`; dùng lại `deriveNotice` và tham số, nên mốc ở đây luôn bằng mốc ở `GET /subscriptions` |
| T-T3 | `PUT` mở một `TransactionRunner.run`: khóa gói `FOR SHARE`, ghi một dòng `plan_terms` (upsert), audit `PLAN_TERMS.SET` (trước/sau); giống hệt ⟹ 200, không audit. `POST` ý kiến: khóa gói, ghi dòng, audit `PLAN_TERM_OPINION.RECORDED`                                             |
| T-T4 | CSDL: CHECK độ dài văn bản ≤ 2000 và số thiết bị ≥ 1; trigger: `plan_terms` chỉ cho gói không phải K5, số thiết bị chỉ cho K4; ý kiến bất biến (`UPDATE`/`DELETE` ⟹ `55000`)                                                                                                        |

### HTTP contract

Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503
`SERVICE_UNAVAILABLE`/`TOKEN_VERIFICATION_UNAVAILABLE`. Trên dây: `Terms = { termsUrl|null, lastReviewedOn|null, aiTraining|null, dataLocation|null,
installLimit: { maxDevicesPerKey|null, note|null }, commercialUse|null, cancellationRefund|null, updatedAt }`; `Opinion = { id, businessOwner: { employeeId, employeeCode, fullName },
opinion, recordedBy, recordedAt }`; `Warning = { code: 'TERMS_REVIEW_DUE', planId, planName, applicationId, applicationName, subscriptionId, noticeDeadline: { value|null, source },
baseDate, reviewFrom, lastReviewedOn|null }`.

| Operation (operationId)                                                                                                                                     | Thành công                                                                                                                     | Lỗi riêng                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /plans/{id}/terms` (`planTermsGet`)                                                                                                                    | 200 `PLAN_TERMS.FETCHED` `{ planId, applicable, sharingPolicy, terms: Terms\|null, opinions: Opinion[], warnings: Warning[] }` | 404 `PLAN.NOT_FOUND`                                                                                                                                                                           |
| `PUT /plans/{id}/terms` (`planTermsSet`) — `{ termsUrl?, lastReviewedOn?, aiTraining?, dataLocation?, installLimit?, commercialUse?, cancellationRefund? }` | 200 `PLAN_TERMS.SET` `{ terms: Terms, changed }`                                                                               | 404 `PLAN.NOT_FOUND`; 422 `PLAN_TERMS.NOT_APPLICABLE`, `PLAN_TERMS.URL_INVALID`, `PLAN_TERMS.TEXT_INVALID`, `PLAN_TERMS.REVIEW_DATE_IN_FUTURE`, `PLAN_TERMS.INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4` |
| `POST /plans/{id}/term-opinions` (`planTermOpinionRecord`) — `{ opinion }`                                                                                  | 201 `PLAN_TERM_OPINION.RECORDED`                                                                                               | 404 `PLAN.NOT_FOUND`; 422 `PLAN_TERMS.NOT_APPLICABLE`, `PLAN_TERMS.TEXT_INVALID`                                                                                                               |
| `GET /plan-warnings` (`planWarningList`) — `page`, `pageSize`                                                                                               | 200 `PLAN_WARNING.LISTED` `{ items: Warning[], pagination, asOf }` — mốc rà soát sớm nhất trước                                | —                                                                                                                                                                                              |

Không có `DELETE`; `sharingPolicy` và trường kết luận không phải trường của `PUT` (trường lạ ⟹ 422 `VALIDATION_ERROR`).

### Dữ liệu và migration

Migration `20261020160000_catalog_plan_terms`: bảng `plan_terms` (khóa chính `plan_id`, CHECK, khóa ngoại), `plan_term_opinions` (khóa ngoại tới `plans`, `employees`), trigger T-T4. Không đụng bảng hiện có. Rollback: không code cũ nào dùng; gỡ bằng migration mới.

### Audit và bảo mật

Audit cùng giao dịch: `PLAN_TERMS.SET` (trước/sau: liên kết, ngày rà soát, các điểm), `PLAN_TERM_OPINION.RECORDED`. Điều khoản là dữ liệu doanh nghiệp, không dữ liệu cá nhân; ý kiến gắn Business Owner (tham chiếu nhân viên, tên đọc qua facade). Không kết luận pháp lý.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                                                                             | Cấp test                               | Bằng chứng sau implement                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| AC-1        | Figma _Organization_: liên kết, rà soát 01/10/2026, sáu điểm (chia sẻ `NOT_ALLOWED` ở gói) ⟹ lưu, `GET` hiện đúng chữ, audit trước/sau                                                          | integration HTTP                       | `plan-terms-http` (sáu điểm, sharingPolicy từ gói, audit trước/sau)                       |
| AC-2        | Điểm (5) "đọc điều khoản thấy chỉ cho dùng nội bộ" lưu nguyên văn; DTO không nhận trường kết luận; CSDL không cột kết luận                                                                      | e2e + integration + constraints        | e2e 12 trường bị chặn + `plan-terms-http` + `plan-terms-constraints` (không cột kết luận) |
| AC-3        | Thuê bao hạn chót 01/12/2026, rà soát 15/11/2025: hôm nay 15/11/2026 ⟹ chưa; 16/11 (mốc) ⟹ có `TERMS_REVIEW_DUE` nêu gói, hạn chót, ngày rà soát; 01/12 ⟹ vẫn có; 02/12 ⟹ hết (ngoài cửa sổ)    | policy + integration (đồng hồ giả lập) | policy + `plan-terms-http` (đồng hồ giả lập: 15/11 chưa, 16/11 → 01/12 có, 02/12 hết)     |
| AC-4        | Cập nhật `lastReviewedOn` 20/11/2026 ⟹ cảnh báo đóng; ngày rà soát trước mốc (15/11) ⟹ vẫn mở; audit ghi thay đổi; tương lai ⟹ 422                                                              | policy + integration                   | policy + `plan-terms-http` (đột biến bỏ so ngày rà soát làm đỏ)                           |
| AC-6        | Ý kiến của Business Owner của ứng dụng ⟹ lưu kèm người ghi và thời điểm; không audit nào khác, không thông báo, không trạng thái mới; CSDL chặn sửa/xóa ý kiến                                  | integration + constraints              | `plan-terms-http` + `plan-terms-constraints` (bất biến)                                   |
| AC-7        | Gói K5: `PUT` terms ⟹ 422 `NOT_APPLICABLE`; `GET` ⟹ `applicable false`; không cảnh báo                                                                                                          | integration + constraints              | `plan-terms-http` + `plan-terms-constraints`                                              |
| AC-8        | Finance, trưởng phòng, Employee, Super Admin gọi `PUT`/`POST` ⟹ 403, không đổi; Finance đọc điều khoản được; Finance đọc cảnh báo ⟹ 403                                                         | e2e + integration                      | e2e 6 vai + `plan-terms-http`                                                             |
| AC-9        | Zoom không hạn chót kết thúc 31/12, không tự gia hạn ⟹ cảnh báo neo 31/12 (mốc 16/12) nhãn `BY_END_DATE`; Office 2021 vĩnh viễn ⟹ không cảnh báo; thuê bao `MISSING` hoặc nháp ⟹ không cảnh báo | integration                            | policy + `plan-terms-http` (đột biến bỏ lọc ACTIVE làm đỏ)                                |
| Ghi dữ liệu | URL không phải http(s) ⟹ 422; chữ quá dài ⟹ 422; số thiết bị cho gói không K4 ⟹ 422, cho K4 ⟹ lưu, ≥ 1; `PUT` giống hệt ⟹ 200 `changed false` không audit; thay toàn bộ (trường vắng ⟹ rỗng)    | policy + integration                   | policy 22 + `plan-terms-http`                                                             |
| Hợp đồng    | `api-inventory`: bốn operation mới có summary ngắn, 401/403/422/503, message riêng; manifest cập nhật; không `DELETE`                                                                           | e2e                                    | e2e `api-inventory` 98 operation                                                          |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (AC-1→AC-4, AC-6→AC-9; AC-10 và cảnh báo vi phạm ở `g4-device-dependent-features`).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi nên e2e + `pnpm openapi:export`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract mới đã báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER` thêm hai model; contract nội module mới được đăng ký kèm lý do.
- [x] ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: mốc rà soát = ngày cảnh báo sớm nhất của thuê bao (một tham số điều khiển cả hai, `OQ-B-11a`); cửa sổ cảnh báo kết thúc ở ngày gốc; chỉ thuê bao kỳ đang hoạt động tính; chính sách chia sẻ nhập một nơi (`PATCH /plans/{id}`); ý kiến Business Owner gắn người hiện tại của ứng dụng và chỉ thêm; `FINANCE` đọc điều khoản; mọi IT Admin thấy cảnh báo (`OQ-B-14`); lưu dở được (`OQ-B-10`). Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.
