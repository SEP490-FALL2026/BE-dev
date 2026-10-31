# Spec: vòng đời khoản cam kết: giải phóng khi hủy hoặc thất bại, không quay ngược

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Tiền đã giữ cho một Request quay lại ngân sách khi Request không còn chi tiêu: việc cấp phát bị IT Admin đóng là thất bại thì cả khoản cam kết được giải phóng ngay trong transaction đóng; Request hủy hay rút thì `releaseForRequest` (cửa của hạng mục rút, hủy và nhóm) giải phóng phần chưa phát sinh chi, còn phần đã thành chi phí ở nguyên. Phần giải phóng có thể là một phần (rút một người trong nhóm, hay chỉ phần chưa chi) và còn lại của Cost Center tăng đúng bằng số đó. Một lần thử lại hay chờ IT chọn không phải thất bại nên khoản vẫn giữ. Khoản đã thành chi phí hay đã giải phóng không bao giờ quay lại đang giữ, do CSDL bảo đảm, và số đã trả về không bao giờ bị rút lại. Finance giải phóng phần dư kèm lý do khi Request đã kết thúc; không lý do thì không lưu. Mỗi lần ghi vào sổ giải phóng (số, lý do, người hay hệ thống, lúc nào) và vào Audit. Kiểm bằng 12 ca tích hợp và 15 ca chính sách thuần.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Vòng đời khoản cam kết: giải phóng khi hủy hoặc thất bại, không quay ngược.
- Boundaries: Cùng transaction với kết cục Request; máy trạng thái khoản cam kết; phần đã thành chi phí do hóa đơn chờ G8.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g5-finance-information-request`, `g5-group-requests`, `g5-request-withdrawal`, `g5-spend-approval-decision`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                                                                                                                     |
| -------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-05-08 | AC-5                  | partial  | AC-1, AC-3, AC-4, AC-6→AC-9, AC-11, AC-12: `g5-request-withdrawal`; AC-2: `g5-finance-information-request`; AC-10: `g3-downstream-finance-integration` |
| US-05-17 | AC-10                 | partial  | AC-1→AC-8, AC-11→AC-17: `g5-group-requests`; AC-9: `g5-spend-approval-decision`                                                                        |
| US-06-06 | AC-2→AC-4, AC-6, AC-7 | partial  | AC-1, AC-5, AC-8→AC-12: `g3-downstream-finance-integration`                                                                                            |

## Supporting references

`FR-5.8`, `QĐ-77g`, `QĐ-83a`.

## Explicit out of scope

- Chuyển khoản cam kết thành chi phí khi hóa đơn khớp (`US-06-06` AC-1, AC-5, AC-8→AC-12 và hóa đơn của `US-12`): `g3-downstream-finance-integration` và nhóm G8; hạng mục này chỉ bảo đảm trạng thái _đã thành chi phí_ không bị đảo.
- Thao tác rút Request, hủy Request và rút một người trong nhóm: `g5-request-withdrawal`, `g5-group-requests` gọi `BudgetsService.releaseForRequest` trong transaction của mình; ở đây facade, sổ và bằng chứng đã có. Repo chưa có thao tác hủy, nên lý do `REQUEST_CANCELLED` chờ người gọi.
- Tính phần _đã phát sinh chi_ của một Request từ chứng từ mua hay hóa đơn: người gọi truyền các số cần giải phóng (`amounts`); căn cứ chi nằm ở G3/G8.
- Thông báo Finance và IT Admin khi giải phóng (`US-05-08` AC-5): `g5-request-status-notifications`.
- Mọi AC của các Story trên mà bảng Primary không liệt kê: chủ của chúng ở cột _Phần còn lại thuộc_ và ở scope map G5.

## Dependencies and blockers

`g5-commitment-creation` (khoản cam kết), `g5-finance-information-request` (không bắt buộc, chỉ cùng nhóm Finance). Việc cấp phát thất bại dùng cổng cấp phát có sẵn của `licensing` (`reportOutcome`). Không có blocker ngoài. Một migration.

## Ownership: module, data, API

- **Module `budgets`:** `commitment-release.policy.ts` (thuần: giải phóng bao nhiêu, từ chối gì), `CommitmentService.release` (cho sự kiện) và `releaseRemainder` (cho Finance), `CommitmentRepo` (`ofRequest`, `lockById`, `release`, `pageReleases`; `totals` trừ phần đã trả về), facade `BudgetsService.releaseForRequest` và `registerReleaseGuard`.
- **Module `requests`:** `AccessRequestGrantGate.reportOutcome` giải phóng khi cấp phát thất bại, trong transaction của tác vụ; `RequestCommitmentReleaseGuard` (đăng ký lúc khởi động) cho biết Request đã kết thúc (`COMPLETED`, `FAILED`, `REJECTED`, `IT_REJECTED`) thì Finance mới giải phóng phần dư.
- **Dữ liệu:** `20261024010000_budgets_commitment_release`: cột `released_minor`, `released_at` của `budget_commitments` và `CHECK` (đã giải phóng đủ ⟺ `RELEASED`); bảng `budget_commitment_releases` (sổ giải phóng, không đổi, phần dư cần lý do và người); trigger `budget_commitments_guard` (giữ Request, Cost Center, năm, số tiền; không đổi gì khi đã `RELEASED`/`EXPENSED`; số đã trả về không giảm).
- **API (203 → 205):** `GET /budget-commitments/{id}/releases` (sổ của một khoản), `POST /budget-commitments/{id}/release` (Finance giải phóng phần dư). Danh sách `GET /budget-commitments` thêm `released` và `held` cho từng khoản.
- **Audit:** `BUDGET_COMMITMENT.RELEASED` (hệ thống hay Finance).

## Behavior and design

**Còn lại (`FR-5.8`).** Khoản cam kết giữ `amount − released`; _còn lại_ = tổng trừ phần đang giữ đã gắn trừ phần đã thành chi phí, nên giải phóng làm còn lại tăng ngay. Khoản giải phóng đủ có trạng thái `RELEASED` và `released_at`; một phần thì vẫn `HELD` với số còn giữ nhỏ hơn.

**Cấp phát thất bại (`US-06-06` AC-3, AC-7).** Chỉ khi IT Admin đóng thất bại, cổng cấp phát chuyển Request sang `FAILED` và giải phóng toàn bộ phần còn giữ trong cùng transaction; ghi sổ với lý do `GRANT_FAILED`, không người (hệ thống), kèm Audit `SYSTEM`. Tác vụ đang thử lại hay đã báo lỗi nhưng chờ IT chọn chưa gọi cổng nên khoản vẫn `HELD`.

**Request đi (`AC-2`, `US-05-08` AC-5, `US-05-17` AC-10).** `releaseForRequest` không có `amounts` giải phóng mọi khoản còn giữ của Request và bỏ qua khoản đã thành chi phí hay đã giải phóng (Request không có khoản nào thì không làm gì); có `amounts` thì giải phóng đúng số của từng năm: năm không có khoản (`NO_COMMITMENT`), khoản không còn giữ (`NOT_HELD`), số không dương, vượt phần đang giữ (`EXCEEDS_HELD`) hay một năm hai lần bị từ chối và không ghi gì. Không tạo Assignment hay tác vụ nào.

**Không quay ngược (`AC-4`).** Quy tắc nằm ở hai nơi: chính sách thuần từ chối giải phóng khoản không còn giữ, và trigger của CSDL từ chối mọi cập nhật một khoản đã `RELEASED` hay `EXPENSED`, đổi Request, Cost Center, năm hay số tiền, và giảm số đã trả về; `CHECK` giữ hình dạng (đủ ⟺ `RELEASED`, số trả về không vượt số tiền).

**Phần dư (`AC-6`).** Finance gọi `POST /budget-commitments/{id}/release` với lý do (1–1000 ký tự; thiếu hay rỗng là 422 và không lưu): giải phóng phần còn giữ của một khoản. Chỉ khi Request đã kết thúc (409 `REQUEST_OPEN` nếu chưa), khoản còn giữ (409 `NOT_HELD`), khoản có (404). Sổ ghi `REMAINDER` kèm lý do và người; `CHECK` buộc phần dư có lý do và người.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Phần _chưa phát sinh chi_ do người gọi nêu (`amounts`), vì căn cứ chi (hóa đơn, khoản sao kê, chứng từ mua) thuộc G3/G8 và chưa có trong BE; mặc định giải phóng mọi phần còn giữ.
- Finance chỉ giải phóng phần dư khi Request đã kết thúc (`COMPLETED`, `FAILED`, `REJECTED`, `IT_REJECTED`), để phần đang chờ mua không bị gọi là phần dư; điều kiện _không còn hóa đơn_ của nguồn chưa kiểm được trước khi có hóa đơn.
- `released_at` chỉ có khi giải phóng đủ; lần giải phóng từng phần nằm trong sổ.
- Mỗi lần giải phóng của một sự kiện ghi một dòng sổ cho mỗi năm.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                              | Cấp test                 | Kết quả mong đợi                                                                                       | Bằng chứng sau implement |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-06-06 AC-3, AC-7 | tác vụ báo lỗi rồi IT Admin đóng thất bại                                        | integration + PostgreSQL | báo lỗi: vẫn `HELD`, còn lại nguyên; đóng: `RELEASED`, còn lại 40tr, sổ `GRANT_FAILED`, Audit `SYSTEM` | xem plan                 |
| US-06-06 AC-2       | Request rút/hủy chưa có tác vụ                                                   | integration              | `RELEASED`, còn lại tăng 15tr, không tác vụ; lần hai không làm gì                                      | xem plan                 |
| US-05-08 AC-5       | phần chưa chi 10tr của 15tr; vượt phần giữ                                       | integration              | `HELD` còn 5tr, còn lại 35tr; vượt bị từ chối, không đổi                                               | xem plan                 |
| US-05-08 AC-5       | năm không có khoản; số không                                                     | integration              | từ chối `NO_COMMITMENT`, `AMOUNT_NOT_POSITIVE`; không đổi                                              | xem plan                 |
| US-05-17 AC-10      | rút một phần 3tr của 12tr; Request khác cùng Cost Center                         | integration              | khoản còn giữ 9tr; Request khác nguyên; sổ `PARTICIPANT_WITHDRAWN`                                     | xem plan                 |
| US-06-06 AC-4       | khoản đã thành chi phí                                                           | integration + PostgreSQL | không giải phóng, không dòng sổ; `UPDATE` về `HELD` hay `RELEASED` bị `23001`                          | xem plan                 |
| US-06-06 AC-4       | khoản đã giải phóng hay một phần                                                 | integration + PostgreSQL | không quay về `HELD`, số trả về không giảm, số tiền/năm không đổi: `23001`; vượt số tiền: `23514`      | xem plan                 |
| US-06-06 AC-6       | còn 3tr, Request đã kết thúc, Finance giải phóng kèm lý do                       | integration              | `RELEASED`, còn lại tăng, sổ có 2 dòng, dòng `REMAINDER` có lý do và Finance                           | xem plan                 |
| US-06-06 AC-6       | thiếu lý do, trống, quá dài, trường thừa; vai khác                               | integration              | 422 không lưu; 403                                                                                     | xem plan                 |
| US-06-06 AC-6       | Request chưa kết thúc; đã giải phóng; đã thành chi phí; không có khoản           | integration              | 409 `REQUEST_OPEN`, `NOT_HELD`; 404                                                                    | xem plan                 |
| US-06-09 AC-2       | danh sách của Finance                                                            | integration              | `held`, `released`, `amount` đúng                                                                      | xem plan                 |
| Toàn vẹn dữ liệu    | sổ giải phóng: sửa, xóa, TRUNCATE; phần dư không lý do hay không người; số không | integration PostgreSQL   | `23001`, `23514`                                                                                       | xem plan                 |
| Quy tắc thuần       | giải phóng hết, phần, từ chối, phần dư                                           | unit                     | 15 ca                                                                                                  | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Cổng cấp phát thất bại giải phóng cam kết trong cùng transaction; cửa `BudgetsService.releaseForRequest` cho rút, hủy và nhóm; Finance giải phóng phần dư khi Request đã kết thúc. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

24/10/2026 (sau `g5-group-requests`): rút một người trong nhóm (`US-05-17` AC-10) gọi `releaseForRequest` với `amounts` của dòng (lý do `PARTICIPANT_WITHDRAWN`), rút cả nhóm dùng `REQUEST_WITHDRAWN` với `amounts`, thất bại của một người dùng `GRANT_FAILED` với `amounts`; bằng chứng ở `group-request-withdrawal` và `group-request-grant`.
