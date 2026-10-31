# Spec: bảo vệ seat trên thuê bao: không giảm dưới số đang chiếm, nháp không cấp được, khuyến nghị K2

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026; thiết kế và triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Triển khai: `verified` local 21/10/2026 (cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`; xem [plan](plan.md)). Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Thuê bao không giảm xuống dưới số Assignment đang chiếm chỗ, thuê bao nháp không nhận Assignment, và IT Admin thấy khuyến nghị cân nhắc gói K2 khi từ ba người dùng K1.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Thuê bao không giảm xuống dưới số Assignment đang chiếm chỗ, thuê bao nháp không nhận Assignment, và IT Admin thấy khuyến nghị cân nhắc gói K2 khi từ ba người dùng K1.
- Boundaries: Đăng ký bảo vệ do `licensing` nạp vào `catalog` lúc khởi tạo; đọc số chiếm chỗ qua facade `licensing`; không bảng mới.
- Not larger: Ngừng ứng dụng (`g3-catalog-retire`) có logic và test riêng.
- Not smaller: Ba bảo vệ cùng dựa trên số chiếm chỗ của một thuê bao.
- Siblings: `g3-plan-declaration`, `g3-subscription-purchase`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                |
| -------- | ---------- | -------- | ------------------------------------------------- |
| US-04-02 | AC-9       | partial  | AC-1→AC-8, AC-10→AC-12: `g3-plan-declaration`     |
| US-04-03 | AC-5, AC-6 | partial  | AC-1→AC-4, AC-7→AC-13: `g3-subscription-purchase` |

Hạng mục làm đủ ba AC trên (AC-9 của `US-04-02`, AC-5 và AC-6 của `US-04-03`); `partial` chỉ vì các AC còn lại của hai Story thuộc hạng mục khác. Hai điểm nói rõ vế đã làm:

- AC-5 nói _gồm chờ cấp và đang thu hồi_: ở đây Assignment chiếm chỗ từ lúc được tạo cho tới khi kết thúc hoặc `Thất bại` (đúng `BR-10.4`), nên Assignment của tác vụ đang chờ, đang chạy, đang lỗi hay đang chờ thu hồi đều được đếm; thu hồi hoàn tất (`US-07-05`, G6) là lúc Assignment kết thúc và hết được đếm.
- AC-6: _thuê bao thôi là nháp khi đủ dữ liệu_ do `g3-subscription-purchase` giữ (trạng thái `DRAFT`/`ACTIVE` tính khi lưu); hạng mục này chỉ chặn việc cấp seat và ghi hiện trạng vào thuê bao còn `DRAFT`.

## Supporting references

`BR-27.5`, `OI-11c`, `ADR-02`, `INV-01`, `QĐ-54a`, `BR-10.4`; ADR-0013 mục 4 (đăng ký chặn chiều ngược `licensing → catalog`).

## Explicit out of scope

Cấp seat (`g4-provisioning-queue-manual`); hủy thuê bao và quyết định giảm số seat theo hợp đồng (`US-11-02`, G8); ngừng ứng dụng (`g3-catalog-retire`).

## Dependencies and blockers

`g4-seat-baseline-import` (Assignment), `g3-subscription-purchase` (sửa thuê bao), `g3-plan-declaration`, `g4-provisioning-queue-manual` (Assignment nguồn Request, `failed_at`). Không blocker.

## Ownership: module, data, API

- Module `catalog`: `CatalogService.registerSeatOccupancy(reader)` và hợp đồng `SeatOccupancyReader` ở `catalog.types.ts`; lát `subscription/` đọc số chiếm chỗ qua đăng ký trong `SubscriptionService.update`; lát `catalog-entry/` đọc người dùng K1 để dẫn xuất khuyến nghị; lỗi mới `SubscriptionQuantityBelowOccupiedError`.
- Module `licensing`: `SeatOccupancyReader` hiện thực ở `assignment/seat-occupancy.reader.ts` bằng `AssignmentRepo` (đếm Assignment chưa kết thúc, chưa `Thất bại`, người dùng khác nhau trên các gói); chính lớp đó tự đăng ký vào `catalog` ở `OnModuleInit` (không đăng ký ở `licensing.module.ts`); `SeatTarget.status` được `AssignmentService` và `ProvisioningService` dùng để từ chối thuê bao nháp (`SeatSubscriptionDraftError`).
- Dữ liệu: không bảng mới, không migration.
- API: không route mới. `PATCH /subscriptions/{id}`: thêm `422 SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED`; `POST /seat-baseline-imports` (xem trước, xác nhận) và `POST /provisioning-tasks`: thêm `422 SEAT_TARGET.SUBSCRIPTION_DRAFT` (và `409 SEAT_TARGET.APPLICATION_RETIRED` khi ứng dụng đã ngừng, do `g3-catalog-retire`); `GET /applications/{id}`: thêm `recommendations`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn               | Kết luận                                                                                                                                                                                                                                                                                                                                                                                 | Nguồn / loại              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Cái gì tính là "đang chiếm chỗ"   | Assignment của thuê bao mà **chưa kết thúc và chưa `Thất bại`** từ hôm nay (kể cả Assignment bắt đầu trong tương lai, vì sẽ chiếm chỗ ngày đó). Một Assignment kết thúc hôm nay hay trước đó không được đếm. Không đếm theo ngày cao điểm tương lai riêng: số Assignment chưa kết thúc là cận trên của số chỗ phải giữ                                                                   | AC-5; `INV-01`; `BR-10.4` |
| Giảm số seat                      | `PATCH` đổi `purchasedQuantity` xuống `n` mà đang chiếm `m > n` ⟹ `422 SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED` kèm `details { occupied: m, requested: n }`, thuê bao không đổi, không audit, không tạo tác vụ thu hồi. `n = m` hợp lệ; tăng luôn hợp lệ. Kiểm trong cùng giao dịch và khóa `FOR UPDATE` của thuê bao mà mọi bên ghi seat đều giữ, nên một lệnh cấp đồng thời không lọt qua | AC-5                      |
| Chỉ kiểm khi số seat thật sự giảm | Sửa trường khác (giá, ngày) hoặc đặt cùng số seat không chạm bảo vệ; thuê bao chưa có số seat (`null`) đặt lần đầu không bị chặn                                                                                                                                                                                                                                                         | AC-5                      |
| Hướng phụ thuộc                   | `catalog` không import `licensing`: `licensing` nạp `SeatOccupancyReader` vào `catalog` lúc `OnModuleInit`. Không đăng ký (ngữ cảnh không có `licensing`) ⟹ bảo vệ ném lỗi cấu hình thay vì cho qua im lặng                                                                                                                                                                              | ADR-0013 mục 4            |
| Thuê bao nháp                     | Cấp seat (`POST /provisioning-tasks`) và ghi hiện trạng (xem trước và xác nhận import) cho thuê bao `DRAFT` ⟹ `422 SEAT_TARGET.SUBSCRIPTION_DRAFT` kèm `details.missing` (danh sách dữ liệu còn thiếu do `catalog` tính), không Assignment, không tác vụ. Gói nội bộ K5 không có thuê bao nên không bị                                                                                   | AC-6                      |
| Khuyến nghị K2                    | `GET /applications/{id}` trả `recommendations: [{ code: 'CONSIDER_K2', k1Holders, threshold: 3 }]` khi **từ 3 người khác nhau** đang giữ Assignment chưa kết thúc trên các gói K1 của phần mềm; dẫn xuất khi đọc, không lưu, **không chặn** thao tác nào (lưu, cấp, đổi vẫn bình thường). Ngưỡng 3 là hằng số của chính sách (`QĐ-54a`), Owner xác nhận khi review                       | AC-9; `QĐ-54a`            |
| Ai thấy                           | Quyền đọc như `GET /applications/{id}` hiện có; khuyến nghị không chứa tên người, chỉ số lượng                                                                                                                                                                                                                                                                                           | AC-9                      |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-G1 | `SeatOccupancyReader` (hợp đồng của `catalog`): `occupiedBySubscription(subscriptionId, day, tx?)`, `openHolderCount(planIds, day)`, `openAssignmentsOfPlans(planIds, day)` (cho `g3-catalog-retire`); `licensing` hiện thực, `catalog` giữ một tham chiếu qua `SeatOccupancyRegistry` |
| T-G2 | `assertQuantityNotBelowOccupied({ requested, occupied })` và `recommendK2({ k1Holders })` là hàm thuần có test; `SubscriptionService.update` gọi bảo vệ **sau** khi khóa thuê bao và **trước** ghi; `SeatTarget` thêm `status` và `missing` để `licensing` từ chối thuê bao nháp       |
| T-G3 | Lỗi `SeatSubscriptionDraftError` ở `licensing.errors.ts`, ánh xạ trong mapper dùng chung của `licensing`                                                                                                                                                                               |

### HTTP contract

Lỗi chung của các route đã có giữ nguyên. Thêm: `PATCH /subscriptions/{id}` (`subscriptionUpdate`): `422 SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED` `{ occupied, requested }`; `POST /seat-baseline-imports`, `POST /seat-baseline-imports/{id}/confirm`, `POST /provisioning-tasks`: `422 SEAT_TARGET.SUBSCRIPTION_DRAFT` `{ missing: string[] }` và `409 SEAT_TARGET.APPLICATION_RETIRED` (cấp và xem trước/xác nhận import từ chối ứng dụng đã ngừng); mô tả OpenAPI của các route trên đã nêu cả `SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED` (`details { occupied, requested }`), `SEAT_TARGET.SUBSCRIPTION_DRAFT` và `SEAT_TARGET.APPLICATION_RETIRED`; `GET /applications/{id}` (`applicationGet`): `recommendations: { code: 'CONSIDER_K2'; k1Holders: number; threshold: number }[]`.

### Dữ liệu và migration

Không có.

### Audit và bảo mật

Từ chối không ghi Audit Trail (không có thay đổi). Khuyến nghị không có dữ liệu cá nhân.

## Test matrix

| AC / rủi ro   | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                             | Cấp test                   | Kết quả mong đợi              | Bằng chứng sau implement                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-04-03 AC-5 | Thuê bao `per_seat` 10 seat, 8 Assignment chưa kết thúc (có tác vụ đang chờ, đang chạy, lỗi): sửa xuống 6 ⟹ 422 nêu 8; xuống 8 ⟹ được; tăng lên 12 ⟹ được; Assignment `Thất bại` và đã kết thúc không được đếm; trường khác sửa được            | policy + HTTP + PostgreSQL | không giảm dưới số đang chiếm | `seat-guards-http`: «US-04-03 AC-5: the number of seats cannot go under the assignments that hold one…», «does not count an assignment that failed, one that ended…», «counts an assignment that begins later…», «lets a subscription with no seats bought yet…»; `seat-guard.policy.spec` |
| US-04-03 AC-5 | Lệnh cấp và lệnh giảm seat đồng thời trên seat cuối: không bao giờ có số Assignment vượt số seat; một trong hai bị từ chối                                                                                                                      | HTTP + PostgreSQL          | khóa chung của thuê bao       | `seat-guards-http`: «a grant and a cut of the seats at the same moment…» và «a cut of the seats waits for a grant that is being made, and then counts it» (tất định: giữ khóa thuê bao và một Assignment chưa commit; đột biến bỏ `FOR UPDATE` của khóa thuê bao làm test đỏ)              |
| US-04-03 AC-6 | Thuê bao `DRAFT`: cấp ⟹ 422 `SUBSCRIPTION_DRAFT` kèm `missing`; xem trước và xác nhận import hiện trạng ⟹ 422; không Assignment, không tác vụ; thuê bao đủ dữ liệu (`ACTIVE`) cấp được; gói nội bộ K5 không bị                                  | HTTP + PostgreSQL          | nháp không cấp được           | `seat-guards-http`: «US-04-03 AC-6: a draft takes no seat, from a request or from a baseline file…», «takes a seat as soon as the draft is complete…»; vế xác nhận baseline: xem ghi chú dưới bảng                                                                                         |
| US-04-02 AC-9 | Canva có 3 người khác nhau trên các gói K1 ⟹ `recommendations` có `CONSIDER_K2` (`k1Holders = 3`); 2 người hoặc 3 Assignment của cùng một người ⟹ không; Assignment đã kết thúc, `Thất bại` hoặc ở gói K2 không đếm; lưu và cấp vẫn bình thường | policy + HTTP + PostgreSQL | khuyến nghị, không chặn       | `seat-guards-http` (khối «US-04-02 AC-9…»: «shows it from three different people…», «counts people, not assignments…», «is a hint only…», «says nothing for software with no K1 plan»); `seat-guard.policy.spec`                                                                           |
| Đăng ký       | Không có người đọc đăng ký ⟹ lỗi cấu hình rõ ràng; có hai lần đăng ký ⟹ lần sau thay lần trước; người đọc của `licensing` tự đăng ký lúc khởi tạo                                                                                               | unit + module graph        | không im lặng cho qua         | `seat-occupancy.registry.spec`                                                                                                                                                                                                                                                             |
| Hợp đồng      | `api-inventory`: không đổi số operation (tổng hiện tại 143); `openapi.json` có `recommendations` và hai mã lỗi mới; manifest không đổi                                                                                                          | e2e                        | OpenAPI đúng                  | `api-inventory.e2e-spec` (143 operation); mô tả OpenAPI nêu các mã lỗi                                                                                                                                                                                                                     |

Vế _xác nhận_ baseline của AC-6: một thuê bao đã `ACTIVE` không quay lại `DRAFT` được (CHECK CSDL `subscriptions_active_complete`), nên tình huống _xác nhận sau khi thuê bao thành nháp_ không thể dựng; vế này được chứng minh bằng đường tương đương là ứng dụng đã ngừng (`SEAT_TARGET.APPLICATION_RETIRED`): `application-retirement-http`, «a baseline file previewed before the retirement cannot be confirmed after it, and writes nothing» (`g3-catalog-retire`). Vế _xem trước_ nháp được test trực tiếp ở `seat-guards-http`.

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI (bảng ở [plan](plan.md#verification-and-handoff); cây làm việc chưa commit).
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: "đang chiếm chỗ" là số Assignment chưa kết thúc và chưa `Thất bại` (kể cả bắt đầu trong tương lai); ngưỡng K2 là 3 người khác nhau, cố định trong chính sách; thuê bao nháp bị từ chối ở cả cấp seat và import hiện trạng; bảo vệ thiếu người đọc đã đăng ký ném lỗi cấu hình. Fixture test cũ tạo thuê bao nháp sẽ đổi sang thuê bao đủ dữ liệu. (Ghi chú 21/10/2026: câu "chưa code" của bản 20/10 không còn đúng; xem bên dưới.)

**21/10/2026, lượt hoàn tất G2–G4 ([kiểm kê](../../../reviews/g2-g4-completion-2026-10-21/README.md); `verified` local, cây làm việc chưa commit trên `5f3b2b3`, chưa review, chưa nghiệm thu).** Mã và test của lát đã có sẵn; lượt này đối chiếu AC với mã/test và sửa:

- Test mới tất định `a cut of the seats waits for a grant that is being made, and then counts it` bổ sung cho test race không tất định (đột biến: bỏ `FOR UPDATE` khỏi khóa thuê bao của repo làm test đỏ).
- Mã lỗi `SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED`, `SEAT_TARGET.SUBSCRIPTION_DRAFT`, `SEAT_TARGET.APPLICATION_RETIRED` vào mô tả OpenAPI của cập nhật thuê bao, cấp seat và import baseline (xem trước/xác nhận).
- Vế xác nhận baseline của AC-6 được chứng minh qua ứng dụng đã ngừng (xem ghi chú dưới ma trận).
- Sửa lệch của spec: người đọc tự đăng ký ở `assignment/seat-occupancy.reader.ts`; chữ ký `assertQuantityNotBelowOccupied({ requested, occupied })`; 143 operation.

Giới hạn còn lại: ngưỡng K2 = 3 và định nghĩa _đang chiếm chỗ_ vẫn là quyết định của AI chờ Owner xác nhận (như đã ghi ở bản 20/10); chưa có remote CI. Không câu nào trong Q1–Q8 của kiểm kê liên quan trực tiếp tới lát này.
