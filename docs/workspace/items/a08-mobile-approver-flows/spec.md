# Spec: A-08 — luồng duyệt trên Mobile (`US-16-02`, `US-16-03`)

- Phụ trách: AI theo giao việc của điều phối (31/10/2026), mục A-08 của [backlog Dev A](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026) — từ mục A-08 của backlog Dev A.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-16-02` AC-1→AC-9, `US-16-03` AC-1→AC-9; `US-05-03`, `US-05-04` AC-1, AC-2, AC-4, AC-6, AC-8→AC-10, AC-12, AC-16; `US-06-01` AC-1→AC-8, AC-12, AC-13, AC-16, AC-17; `US-06-08`; `QĐ-61b`(2)(3), `QĐ-61h`, `QĐ-82m`), BE `6eb12d1` + cây chưa commit đã tích hợp A-01, A-02, A-03, A-05, A-09.
- Nhóm roadmap: G10 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). [Yêu cầu contract gửi Dev B (B-02, B-10)](b02-b10-approval-queue-requirement.md). Hợp đồng Mobile dùng chung: [mobile-contract.md của A-09](../a09-mobile-auth-inbox-contract/mobile-contract.md) (mục 5, 6, 7, 9).

## Business outcome

Trưởng phòng quyết bước nhu cầu, Người duyệt chi quyết bước chi trên snapshot chỉ đọc và bước nhu cầu của Request trưởng
phòng tự gửi, trên điện thoại bằng đúng route của web: cùng quy tắc, cùng bản ghi phê duyệt điện tử, không quyết hai lần,
không cam kết hai lần, màn cũ bị từ chối. Kiểm bằng integration và E2E trên PostgreSQL thật với nhãn client mobile. Hàng đợi
chung hai loại bước chưa có route (B-02/B-10): ghi yêu cầu contract và quyết định thiết kế, không tự thêm endpoint.

## Sizing decision

- Container: G10 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: người giữ bước duyệt (trưởng phòng, Người duyệt chi) quyết trên Mobile với cùng quy tắc và bản ghi như web; chủ là integration/test BE cho Mobile của Dev A.
- Boundaries: không đổi source, route, bảng hay migration; chỉ test và tài liệu. Đọc/ghi qua HTTP route `need-decision`, `spend-approval(s)`, `budget-check`, `plan-line-suggestions`, `similar-seats`, `withdraw`, `notifications`.
- Not larger: tác vụ Employee (`US-16-01`) ở `a07-mobile-employee-flow`; đăng nhập/inbox ở `a09-mobile-auth-inbox-contract`; route hàng đợi của B-02/B-10.
- Not smaller: hai Story chia cùng một bước nhu cầu (`US-16-03` AC-4 là bước nhu cầu của `US-05-04` do Người duyệt chi giữ), cùng bản ghi `approval_records`, cùng ca màn cũ và cùng câu hỏi hàng đợi chung; tách thành hai hạng mục sẽ dựng hai lần cùng ngân sách/phòng và chia đôi quyết định một-hay-hai list.
- Siblings: `a07-mobile-employee-flow`, `a09-mobile-auth-inbox-contract`.
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10).

## Primary Story/AC

| Story    | AC                                | Coverage | Phần còn lại thuộc                                                                                                                               |
| -------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-16-02 | AC-1, AC-2, AC-4→AC-6, AC-8, AC-9 | partial  | AC-3: deferred về chính `a08-mobile-approver-flows`, chờ hàng đợi bước nhu cầu (B-02, Dev B); AC-7: not affected (hành vi app native)            |
| US-16-03 | AC-1→AC-3, AC-6, AC-7, AC-9       | partial  | AC-4, AC-5: deferred về chính `a08-mobile-approver-flows`, chờ hàng đợi chung hai loại bước (B-02/B-10); AC-8: not affected (hành vi app native) |

- **`US-16-02` AC-3 — blocked.** Không có route liệt kê bước nhu cầu đang giao cho người gọi (rà mọi `@Get` của `requests`;
  `GET /step-congestion/steps` chỉ Super Admin). Đã chứng minh vế ranh giới: trưởng phòng khác phòng mở/quyết Request → 404,
  không lộ dữ liệu. Tạm thời app lấy id từ `STEP_ASSIGNED` (`params.stepKind = NEED`) trong inbox.
- **`US-16-03` AC-4, AC-5 — blocked một phần.** Vế quyết định của AC-4 (Người duyệt chi quyết bước nhu cầu của `R9`, rồi bước
  chi; hai bản ghi; cờ cùng người) đã có test xanh, nhưng vế "hiện cùng hàng đợi, phân biệt loại bước" cần route chưa có;
  test ghi nhận `GET /spend-approvals` không chứa bước nhu cầu. AC-5 (hàng đợi chỉ hai loại việc; gia hạn/hợp thức hóa không
  quyết được) phụ thuộc cùng hàng đợi. `US-11-02` đã có ở BE từ A-06 (`POST /subscription-renewals/{id}/decision`), nhưng quyết định gia hạn
  chỉ đi qua `GET /subscription-renewals` và route đó, không nằm trong `GET /spend-approvals` (test
  `subscription-renewal-decision.integration-spec.ts` ghi nhận); `US-13-06` (hợp thức hóa) vẫn chưa có ở BE (G9).
- AC-7 (`US-16-02`) và AC-8 (`US-16-03`) là màn hình của app: các route web-only (gửi thay, nhóm, hỏi Finance, quyết lô, sửa
  ngân sách) vẫn có cho web, BE không chặn theo kênh (A-09); bảng "app không gọi" ở hợp đồng mục 9.

## Supporting references

`US-05-04` AC-1, AC-2, AC-4, AC-6, AC-8, AC-9, AC-12, AC-16; `US-06-01` AC-1→AC-8, AC-12, AC-16, AC-17; `US-06-08` (người thay
thế); `US-06-14` AC-8 (Request mà Người duyệt chi duyệt nhu cầu được kiểm ngay, không qua lô); `QĐ-82m` `INF-05a`, `INF-06`,
`INF-12`; `OQ-G-11` (kênh trong Audit), `OQ-G-12` (approver dự phòng trên mobile), `OQ-G-15` (việc chỉ-web trong hàng đợi).

## Explicit out of scope

- Thêm hoặc sửa route/controller/service/repo của `requests` hay `budgets` (B-02, B-10 sở hữu). Quyết định "hai list hay
  một projection" ghi ở [yêu cầu contract](b02-b10-approval-queue-requirement.md), không implement.
- Quyết lô (`POST /spend-batches/{id}/decisions`), hỏi Finance, trình lô, gửi thay, nhóm, rà soát điều chuyển, ghost seat,
  gia hạn/giảm/hủy thuê bao, hợp thức hóa, tóm tắt AI: chỉ web hoặc ngoài scope; không chặn theo nhãn kênh.
- Approver dự phòng và người thay thế xung đột dùng mobile (`OQ-G-12`, `OQ-G-15`(c)): BE trả lời họ như web; test chỉ dùng
  người thay thế trên nhãn web để chứng minh bước không thuộc Người duyệt chi.
- Ứng dụng native, màn hình, offline: dev Mobile.

## Dependencies and blockers

| Phụ thuộc                                            | Trạng thái                                 | Ảnh hưởng                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **B-02** list bước nhu cầu theo người giữ hiện hành  | **thiếu**                                  | `US-16-02` AC-3 blocked; `US-16-03` AC-4 vế hàng đợi blocked                                                   |
| **B-10** bổ sung cho Mobile (trường loại bước, sort) | **thiếu / chưa chốt**                      | `US-16-03` AC-4, AC-5 vế hàng đợi chung; yêu cầu ở [b02-b10](b02-b10-approval-queue-requirement.md)            |
| `US-11-02` (quyết gia hạn)                           | đã có (A-06), ngoài `GET /spend-approvals` | Quyết định chỉ qua `/subscription-renewals`; hàng đợi chi không chứa gia hạn (test ghi nhận); ghi `OQ-G-15`(a) |
| `US-13-06` (hợp thức hóa)                            | chưa có ở BE (G9)                          | `US-16-03` AC-5 không có gì để ẩn hay kiểm cho loại việc này; ghi `OQ-G-15`(a)                                 |
| `DEF-A09-01`                                         | mở                                         | Trưởng phòng gửi Request cho mình không có vai `EMPLOYEE`; giữ hành vi hiện có                                 |

## Ownership: module, data, API

Không đổi module, bảng, operation, OpenAPI hay manifest. Test mới: `test/integration/requests/mobile-need-decision.integration-spec.ts`,
`test/integration/requests/mobile-spend-approval.integration-spec.ts`, `test/e2e/mobile-approver-journey.e2e-spec.ts`; một `it` thêm
vào `test/integration/licensing/subscription-renewal-decision.integration-spec.ts` (harness gia hạn có sẵn) chứng minh `GET /spend-approvals`
không chứa gia hạn.
Harness có sẵn (`StatusHarness`); không thêm harness. Đọc `approval_records`, `spend_decisions`, `budget_commitments`,
`access_request_steps` bằng SQL chỉ để kiểm bất biến trong test (như suite của `requests`).

## Behavior and design

**Trưởng phòng (`US-16-02`).** Mở Request (`GET /access-requests/{id}`: `businessReason`, `termMonths`, `pricing`, `needStep`),
seat cùng nhóm (`GET …/similar-seats`), dòng kế hoạch (`GET …/plan-line-suggestions`, vai `MANAGER`: phần mềm/gói, số tiền,
khoảng mua, `overdue`, `suggested`; không còn lại/kiểm ngân sách), quyết (`POST …/need-decision`
`{ decision, reason?, termConfirmation?: { reason }, spend?: { planLine: { position, stillNeeded? } | offPlan: true, expectedSpendOn? } }`).
Request trả phí mà duyệt không có `spend` → 422 `ACCESS_REQUEST.PLAN_LINE_REQUIRED`; từ chối thiếu/trống lý do → 422
`VALIDATION_ERROR`; thời hạn > 12 tháng không xác nhận → 422 `ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED`; tự gửi → 403
`ACCESS_REQUEST.OWN_REQUEST` (bước thuộc Người duyệt chi, dòng định tuyến 2); bước đã quyết/đã rút → 409
`ACCESS_REQUEST.STEP_NOT_PENDING`; trưởng phòng phòng khác hoặc hết nhiệm kỳ → 404 `ACCESS_REQUEST.NOT_FOUND`.

**Người duyệt chi (`US-16-03`).** Hàng đợi bước chi `GET /spend-approvals` (cũ nhất trước, chỉ bước chi), chi tiết
`GET /access-requests/{id}/spend-approval`, snapshot chỉ đọc `GET …/budget-check` (`ranAt` = thời điểm dữ liệu, `route`,
`primaryCode`) và `GET …/budget-check/years` (`budget`, `spent`, `held`, `remaining`, `pending`; năm chưa có ngân sách:
`code: NO_ACTIVE_BUDGET`, các số `null`, không phải 0), quyết `POST …/spend-approval` `{ decision, reason?, override?: { reason, years[] } }`
— body strict, không có trường số liệu (gửi thêm trường → 422). Bước nhu cầu của Request trưởng phòng tự gửi:
`POST …/need-decision` (vai quyết `SPENDING_APPROVER`); duyệt xong Request được kiểm ngay và bước chi giao lại chính người đó
(`same_person_as_spend = true` ở cả hai bước, `samePersonAsSpend` trong hàng đợi). Mã: chưa có bước chi (đang chờ Finance,
đã quyết, đã rút) → 409 `SPEND.NO_SPEND_STEP` và không có trong hàng đợi, `GET` chi tiết 404 `SPEND.REVIEW_NOT_FOUND`; vượt
còn lại sau Finance rà soát → 422 `SPEND.OVERRIDE_REQUIRED` (`details.years`), override lý do trống → 422 `VALIDATION_ERROR`;
Finance/trưởng phòng/IT Admin/người đã bị thay → 403 `SPEND.NOT_THE_ASSIGNEE`; người yêu cầu/thụ hưởng → 403
`SPEND.OWN_REQUEST`.

**Hai list hay một projection — quyết định thiết kế (đề xuất cho B-02/B-10, chờ Owner/B xác nhận).** Chọn **hai list**:
`GET /spend-approvals` (có) cho bước chi và list bước nhu cầu của B-02 cho bước nhu cầu theo người giữ hiện hành (Manager,
Người duyệt chi, approver dự phòng); app của Người duyệt chi gọi cả hai và gộp. Lý do, điều kiện để gộp được và các trường
bắt buộc: [b02-b10-approval-queue-requirement.md](b02-b10-approval-queue-requirement.md). Không thêm endpoint ở A-08.

**Màn cũ và đồng thời.** Mọi quyết định khóa hàng Request rồi kiểm lại; hai quyết định cùng lúc (web + mobile) cho đúng một
200 và một 409, một bản ghi, một cam kết (test bằng khóa hàng giữ trong kết nối khác). Bản ghi `approval_records` và
`spend_decisions` append-only (trigger từ chối UPDATE/DELETE); `approval_records.step_id` unique. Không có khóa idempotency
cho client: sau 5xx/mất mạng app đọc lại Request trước khi cho bấm lại (A-09 mục 1).

## Test matrix

Cấp `I` = integration PostgreSQL thật, `E` = E2E. File: `need` = `mobile-need-decision.integration-spec.ts`, `spend` =
`mobile-spend-approval.integration-spec.ts`, `journey` = `test/e2e/mobile-approver-journey.e2e-spec.ts`. Mọi lời gọi của người
quyết mang nhãn mobile; hành động "trên web" mang nhãn web.

| AC / rủi ro                      | Tình huống                                                                                                                                                 | Cấp  | Kết quả mong đợi                                                                                                                                                  | Bằng chứng                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 16-02 AC-4, AC-9 đọc             | Trưởng phòng mở R1 (paid), seat cùng nhóm, dòng kế hoạch                                                                                                   | I    | Lý do/thời hạn/giá; không trường bộ chuẩn; dòng gợi ý; body dòng không có remaining/held/INSUFFICIENT                                                             | `need` (đạt)                                |
| 16-02 AC-1, AC-9 duyệt           | Duyệt không dòng → 422; duyệt với dòng + ngày dự kiến                                                                                                      | I    | `PLAN_LINE_REQUIRED`, 0 bản ghi; rồi `AWAITING_SPEND_SUBMISSION`, `planLineAttached`, Audit assignee = decider = H1                                               | `need` (đạt)                                |
| 16-02 AC-8                       | Duyệt Request nội bộ; thử UPDATE/DELETE bản ghi                                                                                                            | I    | Một bản ghi: người, vai `MANAGER`, phòng, thời điểm, lý do; DB từ chối sửa/xóa                                                                                    | `need` (đạt)                                |
| 16-02 AC-4 thời hạn              | Thời hạn 18 tháng, duyệt không xác nhận rồi có xác nhận                                                                                                    | I    | 422 `TERM_CONFIRMATION_REQUIRED`, 0 bản ghi; rồi bản ghi có `term_confirmation_reason`                                                                            | `need` (đạt)                                |
| 16-02 AC-2                       | Từ chối thiếu/trống lý do; có lý do                                                                                                                        | I    | 422 ×2, 0 bản ghi; `REJECTED`, người yêu cầu có `REQUEST_REJECTED` `{ by: NEED, reason }`                                                                         | `need` (đạt)                                |
| 16-02 AC-5                       | Trưởng phòng tự gửi rồi quyết trên mobile                                                                                                                  | I    | Bước giao Người duyệt chi (dòng 2); 403 `OWN_REQUEST`, 0 bản ghi                                                                                                  | `need`, `journey` (đạt)                     |
| 16-02 AC-6 màn cũ                | Đọc trên mobile, duyệt trên web, rồi duyệt/từ chối trên mobile                                                                                             | I    | 409 `STEP_NOT_PENDING` ×2; 1 bản ghi, 1 Audit; Request y như sau quyết định web                                                                                   | `need` (đạt)                                |
| 16-02 AC-6 đã rút                | Employee rút trên web, trưởng phòng duyệt trên mobile                                                                                                      | I    | 409 `STEP_NOT_PENDING`, 0 bản ghi, `WITHDRAWN`                                                                                                                    | `need` (đạt)                                |
| 16-02 AC-6 người khác            | Trưởng phòng P-ENG mở/duyệt Request của P-DES                                                                                                              | I    | 404 ×2, 0 bản ghi (vế ranh giới của AC-3)                                                                                                                         | `need` (đạt)                                |
| 16-02 AC-6 hết nhiệm kỳ          | Super Admin kết thúc giai đoạn trưởng phòng khi màn còn mở                                                                                                 | I    | 404, 0 bản ghi, bước rời người cũ                                                                                                                                 | `need` (đạt); thêm `session-roles` của A-09 |
| 16-02 AC-6 đồng thời             | Web duyệt + mobile từ chối cùng lúc (khóa hàng giữ)                                                                                                        | I    | `[200, 409]`, đúng 1 bản ghi APPROVED                                                                                                                             | `need` (đạt)                                |
| 16-02 AC-3                       | —                                                                                                                                                          | —    | Blocked: chờ B-02                                                                                                                                                 | không có                                    |
| 16-03 AC-1                       | Ngân sách 100/40 chi/20 giữ, R1 10tr, R khác 15tr chờ; mở hàng đợi, chi tiết, kiểm tra, các năm; gửi trường số                                             | I    | Hàng đợi `BUDGET_OK`; nhu cầu do H1 xác nhận; `ranAt`; 100/40/20/còn 40/chờ 15; trường lạ → 422                                                                   | `spend` (đạt)                               |
| 16-03 AC-2, AC-9 duyệt           | Duyệt trên mobile; thử UPDATE `spend_decisions`                                                                                                            | I    | Bản ghi `SPENDING_APPROVER`, `check_id` (snapshot), 1 cam kết HELD, `REQUEST_SPEND_APPROVED`; DB từ chối sửa                                                      | `spend`, `journey` (đạt)                    |
| 16-03 AC-2 từ chối               | Thiếu lý do; có lý do                                                                                                                                      | I    | 422; `REJECTED`, 0 cam kết, `REQUEST_REJECTED { by: SPEND, reason }`                                                                                              | `spend` (đạt)                               |
| 16-03 AC-2 Finance chưa trả lời  | Người duyệt chi hỏi Finance trên web rồi duyệt trên mobile                                                                                                 | I    | 200, 1 cam kết                                                                                                                                                    | `spend` (đạt)                               |
| 16-03 AC-2 chờ Finance, override | 45tr > còn 40tr: đang Finance rà soát; sau rà soát duyệt không/có override                                                                                 | I    | Không trong hàng đợi, chi tiết 404, quyết 409 `NO_SPEND_STEP`; rồi 422 `OVERRIDE_REQUIRED` (`years`), 422 lý do trống, 200 có override                            | `spend` (đạt)                               |
| 16-03 AC-2 chưa có ngân sách     | Cost Center không ngân sách sau Finance rà soát                                                                                                            | I    | `NO_ACTIVE_BUDGET`, `budget`/`remaining` = `null`                                                                                                                 | `spend` (đạt)                               |
| 16-03 AC-3                       | Finance, trưởng phòng, IT Admin, Employee gọi quyết chi                                                                                                    | I    | 403 `NOT_THE_ASSIGNEE` ×3, 403 `OWN_REQUEST`; vẫn `AWAITING_SPEND_DECISION`                                                                                       | `spend` (đạt)                               |
| 16-03 AC-4 vế quyết định         | H1 tự gửi R9; Người duyệt chi từ chối không lý do, duyệt nhu cầu, rồi duyệt chi                                                                            | I, E | 422; `SPENDING_APPROVER`; hàng đợi `samePersonAsSpend`; 2 bản ghi, hai bước cờ cùng người, 1 cam kết; R9 không có trong `/spend-approvals` khi còn ở bước nhu cầu | `spend`, `journey` (đạt) — AC không claim   |
| 16-03 AC-6                       | Người duyệt chi tự gửi R5                                                                                                                                  | I    | Nhu cầu → approver dự phòng; bước chi → người thay thế; R5 không trong hàng đợi, chi tiết 404, quyết 403 `OWN_REQUEST`; người thay thế duyệt `bySubstitute`       | `spend` (đạt)                               |
| 16-03 AC-7 màn cũ                | Duyệt trên web rồi duyệt/từ chối trên mobile                                                                                                               | I    | 409 `NO_SPEND_STEP` ×2; 1 bản ghi chi, 1 cam kết                                                                                                                  | `spend` (đạt)                               |
| 16-03 AC-7 đã rút                | Employee rút R2 trên web rồi duyệt trên mobile                                                                                                             | I    | 409 `NO_SPEND_STEP`, `WITHDRAWN`, 0 bản ghi chi, 0 cam kết                                                                                                        | `spend` (đạt)                               |
| 16-03 AC-7 đồng thời             | Web và mobile cùng duyệt                                                                                                                                   | I    | `[200, 409]`, 1 bản ghi, 1 cam kết                                                                                                                                | `spend` (đạt)                               |
| 16-03 AC-7 đổi người giữ vai     | Super Admin đặt Người duyệt chi mới khi màn cũ còn mở                                                                                                      | I    | 403 `SPEND.NOT_THE_ASSIGNEE`, chi tiết 404; bước ở hàng đợi người mới, người mới duyệt được, 1 cam kết                                                            | `spend` (đạt)                               |
| Chuỗi                            | Employee gửi → trưởng phòng mở từ inbox, chọn dòng, duyệt → trình lô trên web → Người duyệt chi duyệt từng mục → cam kết → inbox; R9 tự gửi hai quyết định | E    | Chạy trên route web với nhãn mobile                                                                                                                               | `journey` (đạt)                             |
| 16-02 AC-7, 16-03 AC-5, AC-8     | —                                                                                                                                                          | —    | Hành vi app / chờ hàng đợi chung; BE không chặn theo kênh                                                                                                         | không có                                    |

## Definition of Done

- [x] AC claim có test xanh; AC blocked ghi lý do, bằng chứng thiếu và yêu cầu contract.
- [x] Gate liên quan chạy xanh trên cây hiện tại (bảng ở [plan](plan.md)); full integration/E2E do điều phối chạy.
- [x] Không đổi contract HTTP; hợp đồng Mobile mở rộng ở mục 5, 6, 7, 9.
- [x] Không tăng legacy ledger kiến trúc (không đổi source).
- [x] Phần chưa kiểm chứng (hàng đợi, app native) ghi rõ.

## Changes and acceptance

- 31/10/2026: lập spec, implement test. Chưa peer review, chưa Owner review, chưa nghiệm thu.
- `US-16-02` AC-3, `US-16-03` AC-4, AC-5 để `deferred` về chính hạng mục này trong scope map; mở lại khi B-02/B-10 có route.
