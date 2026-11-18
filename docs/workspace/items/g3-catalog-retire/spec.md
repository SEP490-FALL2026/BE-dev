# Spec: ngừng sử dụng ứng dụng bị chặn tới khi dọn sạch quyền và thuê bao (`US-04-01` phần ngừng)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026; thiết kế và triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Triển khai: `verified` local 21/10/2026 (cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`; xem [plan](plan.md)). Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin ghi xác nhận của Business Owner rồi chuyển ứng dụng sang _ngừng sử dụng_ chỉ khi mọi Assignment đã thu hồi và thuê bao đã hủy/hết hạn; nếu bị chặn thì thấy danh sách thứ đang chặn và không có tác vụ thu hồi nào được tự tạo.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: IT Admin ghi xác nhận của Business Owner rồi chuyển ứng dụng sang _ngừng sử dụng_ chỉ khi mọi Assignment đã thu hồi và thuê bao đã hủy/hết hạn; nếu bị chặn thì thấy danh sách thứ đang chặn và không có tác vụ thu hồi nào được tự tạo.
- Boundaries: Trạng thái và xác nhận của `applications` (`catalog`); cổng chặn do `licensing` nạp; route ngừng sử dụng; Audit Trail.
- Not larger: Thu hồi quyền (`US-07-05`) và hủy thuê bao (`US-11-02`) là G6/G8.
- Not smaller: Xác nhận, danh sách chặn và chuyển trạng thái chung một đường kiểm tra.
- Siblings: `g3-catalog-entry`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC                | Coverage | Phần còn lại thuộc                         |
| -------- | ----------------- | -------- | ------------------------------------------ |
| US-04-01 | AC-8, AC-9, AC-14 | partial  | AC-1→AC-7, AC-10→AC-13: `g3-catalog-entry` |

Hạng mục làm đủ ba AC trên; `partial` chỉ vì các AC còn lại của `US-04-01` thuộc `g3-catalog-entry`. Điều kiện _Assignment đã thu hồi_ được kiểm trên dữ liệu thật: Assignment chưa kết thúc và chưa `Thất bại` là thứ chặn, nên việc làm cho một Assignment hết chặn (thu hồi xong, `US-07-05` ở G6) nằm ngoài hạng mục này; test dựng Assignment đã kết thúc bằng SQL. Điều kiện _thuê bao đã hủy_ chưa có thao tác hủy (`US-11-02`, G8): ở đây chỉ thuê bao `TERM` còn hạn (hoặc chưa có ngày kết thúc) chặn, thuê bao đã quá ngày kết thúc thì không.

## Supporting references

`QĐ-62n`, `QĐ-66f`, `OQ-B-01`, `OQ-B-02`, `HO-129`; ADR-0013 mục 4 (đăng ký chặn dùng chung với `g3-subscription-seat-guards`).

## Explicit out of scope

Trạng thái trung gian khi bị chặn (OQ-B-02 — chọn không có, theo AC-9); tự tạo tác vụ thu hồi (cấm, AC-9); hủy thuê bao; ghi _thanh lý_ khoản mua vĩnh viễn (không cần, AC-14); đưa ứng dụng đã ngừng trở lại (không có trong AC).

## Dependencies and blockers

`g3-catalog-entry` (ứng dụng, Business Owner), `g4-seat-baseline-import` (Assignment), `g3-subscription-purchase` (thuê bao), `g3-subscription-seat-guards` (đăng ký người đọc chiếm chỗ của `licensing`). Không blocker.

## Ownership: module, data, API

- Module `catalog`: capability `catalog-entry/` thêm `application-retirement.service.ts` (xác nhận, danh sách chặn, chuyển trạng thái), `application-retirement.policy.ts` + spec thuần, `application-retirement.repo.ts` (chỉ đọc các cột ngừng sử dụng của `applications` và ghi bản xác nhận; việc ghi `applications` — `markRetired` — nằm ở `ApplicationRepo` để một repo duy nhất ghi bảng đó), DTO và controller riêng `application-retirement.controller.ts`; lỗi vào `application.errors.ts`.
- Module `licensing`: người đọc `openAssignmentsOfPlans` của `SeatOccupancyReader` (đăng ký ở `g3-subscription-seat-guards`); ngoài ra `SeatTarget` từ chối ứng dụng đã ngừng (`409 SEAT_TARGET.APPLICATION_RETIRED`) ở cấp seat và ở xem trước/xác nhận import hiện trạng.
- Dữ liệu: bảng `application_retirement_confirmations`; cột `retired_at`, `retired_by_app_user_id`, `retirement_confirmation_id` của `applications`; `PRISMA_MODEL_OWNER`: `ApplicationRetirementConfirmation` → `catalog`.
- API (ba operation, tổng cộng 143 operation của hệ thống ở `api-inventory`; lượt 21/10/2026 không thêm route nào): `POST /applications/{id}/retirement-confirmations` (`applicationRetirementConfirm`), `GET /applications/{id}/retirement` (`applicationRetirementGet`), `POST /applications/{id}/retire` (`applicationRetire`).

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn         | Kết luận                                                                                                                                                                                                                                                                                                                                                            | Nguồn / loại          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Xác nhận của Business Owner | IT Admin ghi `POST …/retirement-confirmations` `{ businessOwnerEmployeeId, note }`: người đó phải là Business Owner **hiện tại** của ứng dụng và còn làm việc; `note` 1–2000 ký tự sau khi cắt. Bản ghi bất biến: người ghi, Business Owner, nội dung, thời điểm. Audit Trail ghi người ghi, Business Owner và nội dung. Ghi nhiều lần được; mỗi lần là một bản ghi | AC-8; `QĐ-62n`        |
| Thiếu xác nhận              | `POST …/retire` mà chưa có xác nhận của Business Owner **hiện tại** ⟹ `422 APPLICATION.RETIREMENT_NEEDS_CONFIRMATION`, trạng thái không đổi. Xác nhận của người đã thôi là Business Owner (đã đổi người) không tính                                                                                                                                                 | AC-8                  |
| Thứ chặn                    | (1) **Assignment** chưa kết thúc và chưa `Thất bại` trên bất kỳ gói nào của ứng dụng (kể cả gói nội bộ K5 không có thuê bao); (2) **thuê bao `TERM`** của các gói đó còn hạn (`end_date` rỗng hoặc từ hôm nay trở đi). Khoản **mua vĩnh viễn** không chặn và không cần _thanh lý_                                                                                   | AC-9, AC-14; `QĐ-66f` |
| Bị chặn                     | `409 APPLICATION.RETIREMENT_BLOCKED` kèm `details { assignments: [{ assignmentId, employeeId, employeeCode, fullName, planId, planName, subscriptionId }], subscriptions: [{ subscriptionId, planId, planName, endDate }] }`; trạng thái ứng dụng, Assignment, thuê bao không đổi; **không tạo tác vụ thu hồi nào** và không ghi `provisioning_tasks`               | AC-9                  |
| Thứ tự kiểm                 | Đã ngừng ⟹ `409 APPLICATION.ALREADY_RETIRED`; thiếu xác nhận ⟹ 422; bị chặn ⟹ 409 kèm danh sách; sạch ⟹ chuyển. Thiếu xác nhận được báo trước kể cả khi ứng dụng sạch (AC-8)                                                                                                                                                                                        | AC-8, AC-9            |
| Chuyển trạng thái           | `catalog_status = RETIRED`, `retired_at`, `retired_by_app_user_id`, `retirement_confirmation_id` đặt một lần (CSDL giữ: `RETIRED ⟺ retired_at`, và ứng dụng đã ngừng không đổi lại); Audit Trail ghi người chuyển, Business Owner và nội dung xác nhận                                                                                                              | AC-8                  |
| Xem trước                   | `GET …/retirement` trả `{ status, confirmations (mới nhất trước), confirmed (của Business Owner hiện tại), blockers, canRetire }` dẫn xuất khi đọc, để màn hình hiện danh sách chặn mà không phải thử và bị từ chối                                                                                                                                                 | AC-9                  |
| Quyền                       | Ghi xác nhận và ngừng: chỉ `IT_ADMIN` (Finance, Super Admin, trưởng phòng, Employee ⟹ 403). Xem trước: `IT_ADMIN`, `FINANCE` (như đọc ứng dụng)                                                                                                                                                                                                                     | `SoD-*`; US-04-01     |
| Không tự thu hồi            | Không có đường nào tự tạo tác vụ thu hồi, tự hủy thuê bao hay tự kết thúc Assignment khi ngừng hay khi bị chặn                                                                                                                                                                                                                                                      | AC-9; `QĐ-62n`        |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-R1 | `application-retirement.policy.ts` thuần: `assertConfirmable({ owner, businessOwnerEmployeeId, ownerStatus })`, `cleanNote`, `decide({ retired, confirmedByCurrentOwner, assignments, subscriptions })` ⟹ `RETIRE` hoặc ném lỗi theo thứ tự cố định, `activeTermSubscriptions(rows, today)` |
| T-R2 | `retire` một `TransactionRunner.run`: khóa ứng dụng `FOR UPDATE`, đọc Business Owner, xác nhận mới nhất, các gói và thuê bao còn hạn; người đọc của `licensing` đếm Assignment; `decide`; ghi trạng thái (`ApplicationRepo.markRetired`) và audit cùng giao dịch                            |
| T-R3 | Bản ghi xác nhận bất biến (trigger `55000`, không xóa); ứng dụng đã ngừng không đổi trạng thái (trigger `55000` trên `applications` khi `RETIRED` đổi lại)                                                                                                                                  |
| T-R4 | Ghi xác nhận khóa ứng dụng `FOR UPDATE` rồi khóa hàng nhân viên của Business Owner hiện tại `FOR SHARE` (INV-06): một lần ghi nhận nghỉ việc đang chạy thì xác nhận chờ rồi thấy người đó đã thôi, thay vì ghi xác nhận cho người vừa rời                                                   |

### HTTP contract

Lỗi chung: 401, 403 `AUTHORIZATION.FORBIDDEN`, 404 `APPLICATION.NOT_FOUND`, 422 `VALIDATION_ERROR`, 503.

| Operation (operationId)                                                                                                   | Thành công                                                | Lỗi riêng                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /applications/{id}/retirement-confirmations` (`applicationRetirementConfirm`) — `{ businessOwnerEmployeeId, note }` | 201 `APPLICATION.RETIREMENT_CONFIRMED` `{ confirmation }` | 422 `APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER`, `RETIREMENT_NOTE_REQUIRED`; 409 `APPLICATION.ALREADY_RETIRED`                |
| `GET /applications/{id}/retirement` (`applicationRetirementGet`)                                                          | 200 `APPLICATION.RETIREMENT_FETCHED` `{ retirement }`     | —                                                                                                                             |
| `POST /applications/{id}/retire` (`applicationRetire`)                                                                    | 200 `APPLICATION.RETIRED` `{ id, status }`                | 409 `APPLICATION.ALREADY_RETIRED`, `APPLICATION.RETIREMENT_BLOCKED` (`details` như trên); 422 `RETIREMENT_NEEDS_CONFIRMATION` |

Route của lát khác bị ảnh hưởng: cấp seat (`POST /provisioning-tasks`) và xem trước/xác nhận import hiện trạng (`POST /seat-baseline-imports`, `…/{id}/confirm`) trả `409 SEAT_TARGET.APPLICATION_RETIRED` khi ứng dụng đích đã ngừng; mô tả OpenAPI của các route này và của ba route ngừng sử dụng đã nêu các mã trên (`APPLICATION.ALREADY_RETIRED`, `APPLICATION.RETIREMENT_BLOCKED`, `APPLICATION.RETIREMENT_NEEDS_CONFIRMATION`, `APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER`, `SEAT_TARGET.APPLICATION_RETIRED`).

### Dữ liệu và migration

Migration `20261020240000_catalog_application_retirement`: bảng `application_retirement_confirmations` (`id`, `organization_id`, `application_id`, `business_owner_employee_id`, `note` không rỗng, `recorded_by_app_user_id`, `recorded_at`; khóa ngoại `RESTRICT`; trigger bất biến); cột `retired_at`, `retired_by_app_user_id`, `retirement_confirmation_id` của `applications`; CHECK `catalog_status = 'RETIRED' ⟺ retired_at IS NOT NULL`; ứng dụng `RETIRED` hiện có (nếu có) được điền `retired_at` bằng `updated_at`; trigger chặn đổi lại ứng dụng đã ngừng.

### Audit và bảo mật

`APPLICATION.RETIREMENT_CONFIRMED` (Business Owner, nội dung), `APPLICATION.RETIRED` (Business Owner, nội dung, mã xác nhận). Từ chối không ghi Audit Trail. Không dữ liệu cá nhân ngoài mã người, tên chỉ nằm trong danh sách chặn của phản hồi.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                                                                     | Cấp test                   | Kết quả mong đợi                    | Bằng chứng sau implement                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-01 AC-8  | Notion sạch (không Assignment, thuê bao quá hạn), chưa xác nhận ⟹ `retire` 422 thiếu xác nhận; ghi xác nhận của `B2` (Business Owner hiện tại) ⟹ 201; `retire` ⟹ 200 `RETIRED`; Audit Trail ghi người ghi, `B2`, nội dung; xác nhận của người không phải Business Owner ⟹ 422; ghi không nội dung ⟹ 422 | policy + HTTP + PostgreSQL | chỉ ngừng khi có xác nhận           | `application-retirement-http`: «US-04-01 AC-8: needs the confirmation…»; `application-retirement.policy.spec`                                                                                                                                                                                      |
| US-04-01 AC-8  | Business Owner đổi người sau khi xác nhận ⟹ xác nhận cũ không tính, `retire` 422                                                                                                                                                                                                                        | HTTP + PostgreSQL          | xác nhận đúng người hiện tại        | `application-retirement-http`: «does not count the confirmation of someone who is no longer the Business Owner»                                                                                                                                                                                    |
| US-04-01 AC-9  | Notion còn 2 Assignment chưa kết thúc và 1 thuê bao `TERM` còn hạn, đã xác nhận ⟹ 409 kèm đúng 2 Assignment và 1 thuê bao; ứng dụng, Assignment, thuê bao không đổi; `provisioning_tasks` không thêm dòng; Cổng báo cáo nội bộ (K5, 1 Assignment, không thuê bao) ⟹ 409 chỉ có Assignment đó            | HTTP + PostgreSQL          | bị chặn, liệt kê, không tự thu hồi  | `application-retirement-http`: «US-04-01 AC-9: is refused while assignments and a running subscription hold it…», «…an internal application with one assignment and no subscription…»                                                                                                              |
| US-04-01 AC-14 | Office 2021 chỉ có khoản mua vĩnh viễn và 1 Assignment ⟹ 409 chỉ có Assignment (không có thuê bao, không nêu _thanh lý_); Assignment đã kết thúc ⟹ `retire` 200 mà không ghi thanh lý                                                                                                                   | HTTP + PostgreSQL          | khoản mua vĩnh viễn không chặn      | `application-retirement-http`: «US-04-01 AC-14: a perpetual purchase never holds an application…»                                                                                                                                                                                                  |
| Chặn           | Assignment `Thất bại` hoặc đã kết thúc không chặn; thuê bao `TERM` quá ngày kết thúc không chặn, hết hạn hôm nay hay chưa có ngày kết thúc thì chặn                                                                                                                                                     | policy + HTTP + PostgreSQL | định nghĩa chặn đúng                | `application-retirement-http`: «does not hold an application with an assignment that failed or ended…»; `application-retirement.policy.spec` («are the term ones that have not run out»)                                                                                                           |
| Trạng thái     | `retire` lần hai ⟹ 409 đã ngừng; ghi xác nhận cho ứng dụng đã ngừng ⟹ 409; CSDL chặn đổi `RETIRED` trở lại và sửa hoặc xóa xác nhận; `GET …/retirement` dẫn xuất đúng `canRetire`                                                                                                                       | HTTP + constraints         | trạng thái một chiều                | `application-retirement-http`: «retires once and for good…», «shows an application that is retired as retired…»; `application-retirement-constraints` («is retired for good», «is never changed and never deleted»)                                                                                |
| Quyền          | Finance, Super Admin, trưởng phòng, Employee ghi xác nhận hoặc ngừng ⟹ 403; Finance xem trước ⟹ 200                                                                                                                                                                                                     | e2e + HTTP                 | chỉ IT Admin ghi                    | `application-retirement-http`: «is for the IT Admin to record and retire; Finance only looks…»; `application-retirement.e2e-spec`                                                                                                                                                                  |
| Đồng thời      | `retire` đồng thời với một lệnh cấp seat vào ứng dụng đó ⟹ hoặc cấp thành công và `retire` thấy Assignment (409), hoặc `retire` thắng và cấp vào ứng dụng đã ngừng không còn nằm trong tập chặn; kết quả luôn nhất quán                                                                                 | HTTP + PostgreSQL          | khóa ứng dụng                       | `application-retirement-http`: «a grant and a retirement at the same moment…», «a retirement waits for a grant that is being made…» (khóa giữ tất định, `test/support/lock-wait.ts`, `409 APPLICATION.RETIREMENT_BLOCKED`), «INV-06: a confirmation waits for a departure that is being recorded…» |
| Hợp đồng       | `api-inventory`: ba operation mới có summary, 401/403/404/409/422/503, message riêng; manifest cập nhật                                                                                                                                                                                                 | e2e                        | 143 operation (ba của lát này)      | `api-inventory.e2e-spec` (143 operation); `application-retirement.e2e-spec`                                                                                                                                                                                                                        |
| Trạng thái     | Ứng dụng đã ngừng không nhận seat: cấp và xem trước import hiện trạng ⟹ 409 `SEAT_TARGET.APPLICATION_RETIRED`; xem trước làm trước khi ngừng thì không xác nhận được sau khi ngừng (409), không ghi gì                                                                                                  | HTTP + PostgreSQL          | ngừng là một chiều với cả chiều cấp | `application-retirement-http`: «takes no seat under a retired application…», «a baseline file previewed before the retirement cannot be confirmed after it…»                                                                                                                                       |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI (bảng ở [plan](plan.md#verification-and-handoff); cây làm việc chưa commit).
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: xác nhận phải là của Business Owner hiện tại và còn làm việc, ghi bất biến, nhiều lần được; xác nhận của người đã không còn là Business Owner không tính; thuê bao `TERM` còn hạn (hoặc chưa có ngày kết thúc) chặn, khoản mua vĩnh viễn không chặn; ứng dụng đã ngừng không đổi lại trong lát này; thêm route xem trước (`GET …/retirement`) ngoài hai route Story nêu. (Ghi chú 21/10/2026: câu "chưa code" của bản 20/10 không còn đúng; xem bên dưới.)

**21/10/2026, lượt hoàn tất G2–G4 ([kiểm kê](../../../reviews/g2-g4-completion-2026-10-21/README.md); `verified` local, cây làm việc chưa commit trên `5f3b2b3`, chưa review, chưa nghiệm thu).** Mã, migration và test của lát đã có sẵn; lượt này đối chiếu từng AC với mã/test rồi sửa các khoảng trống:

- Xác nhận khóa hàng nhân viên của Business Owner hiện tại `FOR SHARE` (INV-06, T-R4), có test tất định `INV-06: a confirmation waits for a departure that is being recorded`.
- `markRetired` chuyển sang `ApplicationRepo`; `ApplicationRetirementRepo` chỉ đọc các cột ngừng sử dụng và ghi bản xác nhận.
- Test mới: `GET …/retirement` của ứng dụng đã ngừng; xem trước import làm trước khi ngừng không xác nhận được sau đó (409); `a retirement waits for a grant that is being made` (khóa giữ tất định, 409 `APPLICATION.RETIREMENT_BLOCKED`).
- Đột biến đã chứng minh (giữ SQL/mã hợp lệ, test đỏ, rồi khôi phục): bỏ khóa `plans` trong `retire`; bỏ khóa nhân viên khi xác nhận.
- Mô tả OpenAPI nêu các mã lỗi mới, gồm `SEAT_TARGET.APPLICATION_RETIRED`.
- Sửa lệch của spec: số operation là 143 (không phải 133; không route nào được thêm ở lượt này); `POST …/retire` trả `{ id, status }`.

Giới hạn còn lại: (1) `confirmedBy` chấp nhận lại một xác nhận cũ của người hiện là Business Owner khi người đó từng được thay rồi phục hồi (xác nhận cũ lại có hiệu lực) — câu hỏi cho Owner; (2) thuê bao `TERM` nháp không có ngày kết thúc chặn việc ngừng và chưa có đường hủy cho tới `US-11-02` (G8); (3) test dựng Assignment đã kết thúc bằng SQL vì thu hồi (`US-07-05`) thuộc G6; (4) chưa có remote CI, chưa chạy trên môi trường dùng chung.

Câu hỏi cho Owner: giới hạn (1) có chấp nhận không hay xác nhận phải ghi lại sau mỗi lần đổi Business Owner; giới hạn (2) có cần đường hủy thuê bao nháp sớm hơn `US-11-02` không. Chưa có câu nào trong Q1–Q8 của kiểm kê liên quan trực tiếp tới lát này.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F23 — khai thuê bao/nhập khóa cho ứng dụng đã ngừng.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
