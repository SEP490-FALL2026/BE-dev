# Spec: đường yêu cầu không phí cho phần mềm nội bộ tới IT thực hiện thủ công

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Request phần mềm nội bộ không phí đã có trong danh mục đi từ quyết định nhu cầu của trưởng phòng thẳng tới IT Admin cấp thủ công qua hàng đợi cấp phát đã có: không bước duyệt chi, không hỏi còn seat, không khoản cam kết. Cổng cấp phát giữa Request và hàng đợi được nối thật: Request chỉ được cấp một lần và chỉ khi đã đủ phê duyệt; việc cấp và kết cục của tác vụ (hoàn tất có bằng chứng, hoặc IT đóng thất bại) đưa Request tới `EXECUTING`, `COMPLETED` hay `FAILED`. Kiểm bằng chuỗi gửi, duyệt, `POST /provisioning-tasks`, nhận việc, hoàn tất.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Đường yêu cầu không phí cho phần mềm nội bộ tới IT thực hiện thủ công.
- Boundaries: Nối Request vào hàng đợi cấp phát đã có qua `GRANT_REQUEST_GATE`; ghi Assignment và tác vụ thủ công; chỉ nhánh (a).
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g4-request-and-transfer-integration`, `g5-internal-software-registration`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC               | Coverage | Phần còn lại thuộc                                         |
| -------- | ---------------- | -------- | ---------------------------------------------------------- |
| US-05-20 | AC-1, AC-2, AC-7 | partial  | AC-3→AC-6, AC-8→AC-10: `g5-internal-software-registration` |

## Supporting references

`US-05-02` AC-9, `US-05-01` AC-10, `QĐ-49b`, `QĐ-50a`.

## Explicit out of scope

- Phần mềm nội bộ **chưa có** trong danh mục (đề xuất, IT xác định là nội bộ, đăng ký cùng Business Owner, giữ ở bước đánh giá khi chưa có Business Owner, phần mềm bên ngoài ở lại nhánh (c), việc cấp kéo theo chi phí): `g5-internal-software-registration` (`US-05-20` AC-3→AC-6, AC-8→AC-10), cần Request nhánh (c) của `g5-it-assessment-of-new-software`.
- Bước duyệt chi và mọi đường của phần mềm trả phí: các hạng mục ngân sách và duyệt chi. Cổng ở đây từ chối Request trả phí cho tới khi nó đủ phê duyệt.
- Thông báo cho người yêu cầu về kết cục (`US-05-15`), giải phóng khoản cam kết khi cấp thất bại (`US-07-04` AC-15, `g5-commitment-lifecycle`), rút Request khi tác vụ đang chạy (`US-05-08`).
- Phần giao nối G6 của `g4-request-and-transfer-integration` (đổi chức vụ, điều chuyển, `US-04-10` AC-5, AC-6, AC-11): vẫn chờ G6. Hạng mục này làm đúng phần cổng của `US-07-01` AC-1, AC-3, AC-15, AC-16 (xem mục Changes).

## Dependencies and blockers

`g5-request-submission-and-routing`, `g5-manager-need-decision` (đã `verified` local), `g4-provisioning-queue-manual` (hàng đợi cấp phát, bằng chứng bắt buộc), `g4-provisioning-failure-handling` (đóng thất bại). Không có blocker ngoài. Một migration thêm giá trị enum `EXECUTING`, `COMPLETED`, `FAILED`. Review hậu merge `DB-06`: cổng phải kiểm Request trong transaction cấp có khóa và bảo đảm một lần cấp mỗi Request — hạng mục này làm việc đó.

## Ownership: module, data, API

- **Module:** `requests` (capability `access-request/`: `access-request-grant.gate.ts`, `grant.policy.ts`) và `licensing` (cổng, `provisioning/registered-grant-request-gate.service.ts`, hai điểm gọi). **Hướng phụ thuộc:** `requests → licensing`; `licensing` giữ cổng là port và `requests` **đăng ký** cổng của mình bằng `LicensingService.registerGrantRequestGate` trong `onModuleInit` (cùng mẫu `registerSeatOccupancy` của ADR-0013 mục 4), nên `licensing` không import `requests` và không có vòng.
- **Hợp đồng đổi:** `GrantRequestGate` có thêm `claimForGrant(tx, requestId)` (khóa Request, xét lại, chuyển sang `EXECUTING` trong transaction của lần cấp) và `reportOutcome(tx, requestId, outcome)` (`COMPLETED` khi tác vụ cấp hoàn tất có bằng chứng, `FAILED` khi IT đóng thất bại). `check` giữ nguyên làm đọc không khóa để tìm gói và người thụ hưởng trước. `RegisteredGrantRequestGate` chuyển tiếp tới cổng đã đăng ký và từ chối mọi Request cho tới khi có; token `GRANT_REQUEST_GATE` giữ nguyên nên harness và test ghi đè được.
- **Dữ liệu:** giá trị `EXECUTING`, `COMPLETED`, `FAILED` của `AccessRequestState`; không bảng mới. Request chuyển trạng thái ở `AccessRequestRepo.setState`, nơi duy nhất ghi.
- **API:** không route mới. `POST /provisioning-tasks` (G4) nay hỏi cổng thật; `GET /access-requests/{id}` mở rộng enum trạng thái.

## Behavior and design

**Chọn trạng thái cho cổng (`grant.policy.ts`).** Chỉ `AWAITING_EXECUTION` là cấp được (người thụ hưởng và gói của Request). `PENDING`, `WAITING_CONTROLLED`, `AWAITING_SPEND_SUBMISSION` là _chưa đủ phê duyệt_ (409 `PROVISIONING.REQUEST_NOT_APPROVED`, `US-07-01` AC-3); `REJECTED`, `EXECUTING`, `COMPLETED`, `FAILED` là _đã kết thúc_ (409 `PROVISIONING.REQUEST_ENDED`, AC-16); không có Request là 404 `REQUEST.NOT_FOUND`.

**Cấp đúng một lần.** `ProvisioningService.grant` đọc cổng không khóa để tìm gói và người, rồi **trong transaction cấp**, trước khi khóa mục tiêu seat, gọi `claimForGrant`: Request bị khóa `FOR UPDATE`, xét lại và chuyển sang `EXECUTING`. Hai lần cấp đồng thời xếp hàng ở khóa này, lần sau thấy `EXECUTING` và bị từ chối; nếu việc cấp sau đó bị từ chối (ví dụ trùng quyền) cả transaction hoàn tác nên Request vẫn `AWAITING_EXECUTION`. Nếu Request đổi giữa lần đọc và lần khóa thì bị từ chối như chưa đủ phê duyệt. Assignment sinh ra mang nguồn `REQUEST`, không cờ khởi tạo (`AC-15`).

**Kết cục.** Khi tác vụ **cấp** hoàn tất (phải có bằng chứng, như G4) hoặc IT đóng nó là thất bại, cùng transaction báo cổng và Request thành `COMPLETED` hoặc `FAILED`; thử lại, chuyển làm tay và báo lỗi không phải kết cục (`QĐ-62i`). Tác vụ thu hồi không báo gì. Mỗi chuyển trạng thái có một sự kiện audit hệ thống (`ACCESS_REQUEST.GRANT_STARTED`, `GRANT_COMPLETED`, `GRANT_FAILED`) cạnh sự kiện của tác vụ ghi người IT và bằng chứng.

**Không bước chi, không hỏi seat, không cam kết (`US-05-20` AC-1, AC-7).** Request nội bộ chỉ có bước nhu cầu; gói K5 không có thuê bao nên G4 không kiểm sức chứa; Người duyệt chi không có bước và không đọc được Request (trừ khi họ giữ bước nhu cầu do trưởng phòng tự gửi).

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** (a) đăng ký cổng thay vì để `licensing` import `requests`; (b) tên trạng thái `EXECUTING`, `COMPLETED`, `FAILED`; (c) chuyển sang `EXECUTING` ngay lúc tạo tác vụ chứ không đợi IT nhận việc, vì từ lúc đó Assignment đã giữ chỗ (`BR-10.4`).

## Test matrix

| AC / rủi ro                            | Tình huống (gồm từ chối, edge case)               | Cấp test                                  | Kết quả mong đợi                                                                 | Bằng chứng sau implement |
| -------------------------------------- | ------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| US-05-20 AC-1                          | gửi phần mềm nội bộ, trưởng phòng duyệt, IT cấp   | integration HTTP + PostgreSQL (cổng thật) | tác vụ `QUEUED`, Request `EXECUTING`, một bước, Assignment nguồn `REQUEST`       | xem plan                 |
| US-05-20 AC-2                          | hoàn tất không bằng chứng; có bằng chứng          | integration                               | 422 và Request vẫn `EXECUTING`; sau đó `COMPLETED`, audit đủ ba sự kiện          | xem plan                 |
| US-05-20 AC-7                          | Người duyệt chi đọc Request nội bộ                | integration                               | 404; không bước nào của người đó                                                 | xem plan                 |
| US-07-01 AC-3                          | Request chưa quyết; Request trả phí chờ trình chi | integration                               | 409 `REQUEST_NOT_APPROVED`, không Assignment hay tác vụ, Request không đổi       | xem plan                 |
| US-07-01 AC-16                         | Request bị từ chối; Request đã cấp                | integration                               | 409 `REQUEST_ENDED`, không Assignment hay tác vụ mới                             | xem plan                 |
| US-07-01 AC-1, AC-15                   | cấp một Request đã đủ phê duyệt                   | integration                               | một Assignment nguồn `REQUEST` cho người thụ hưởng                               | xem plan                 |
| Cấp một lần, đồng thời                 | hai lần cấp cùng lúc                              | integration                               | một 201, một 409; một Assignment                                                 | xem plan                 |
| Không làm dở                           | việc cấp bị từ chối vì trùng quyền                | integration                               | 422 `LICENSE_ASSIGNMENT.OVERLAP`; Request vẫn `AWAITING_EXECUTION`, không tác vụ | xem plan                 |
| Kết cục thất bại                       | báo lỗi rồi đóng thất bại                         | integration                               | chỉ khi đóng mới `FAILED`                                                        | xem plan                 |
| Cổng chưa đăng ký / không biết Request | Request không tồn tại; e2e không CSDL             | integration + e2e                         | 404 `REQUEST.NOT_FOUND`                                                          | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Hạng mục làm kèm phần cổng của [`g4-request-and-transfer-integration`](../g4-request-and-transfer-integration/spec.md) (`US-07-01` AC-1, AC-3, AC-15, AC-16) vì không thể cấp từ Request thật mà thiếu nó; phần còn lại của hạng mục đó (G6, `US-07-04`) vẫn chờ. `US-05-20` AC-3→AC-6, AC-8→AC-10 tách sang `g5-internal-software-registration`. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
