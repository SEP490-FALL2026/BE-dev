# Spec: dashboard-request-queues-wiring — đếm "yêu cầu của tôi" và "chờ tôi duyệt nhu cầu" trên trang tổng quan

- Phụ trách: chưa phân công — người nhận (dev hoặc AI theo giao việc Owner) ghi tên khi nhận; sở hữu thiết kế, implementation,
  test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026), tách từ giao việc `qd93-parameter-labels-dashboard-queues`.
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 mục 5.5.3 bảng trang tổng quan — Employee: yêu cầu của mình, trưởng phòng: yêu cầu đang chờ mình
  duyệt; User Stories `US-12-15` AC-2, AC-3 chỉ truy vết; tài liệu API cho FE `Figma UI-UX/API-Integration/changes/CHANGELOG.md`
  finding `API-DOC-F06`), BE `1a77ffe8` (nhánh `dev`, sạch: `employee-dashboard.service.ts:42` và `manager-dashboard.service.ts:62`
  còn `notAvailable('REQUEST_QUEUE_NOT_DELIVERED')`; `meAccessRequestList`, `needDecisionList` đã có).
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit); hạng mục này chỉ dùng `D-S26` (quyền chạy test, plan).
  Thứ tự merge của lượt `QĐ-93` (mục _Dependencies_) cũng ghi sau pin.
- Nhóm roadmap: không thuộc nhóm G (technical-enabler; `US-12-15` thuộc G8 chỉ là truy vết — xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Employee mở trang tổng quan và mục `requests` hiện **số yêu cầu mình đã gửi còn đang chờ** (bằng tổng của `meAccessRequestList`
với `view=open`), trưởng phòng mở trang tổng quan và mục `needApprovals` hiện **số bước nhu cầu đang chờ chính mình quyết** (bằng
tổng của `needDecisionList`) — thay cho `NOT_AVAILABLE`. Kiểm được bằng integration HTTP: mỗi số bằng tổng của operation nguồn khi
cùng người gọi đọc.

## Sizing decision

- Container: finding FE `API-DOC-F06` (Docs CHANGELOG, mở cho BE 01/11/2026), giao cùng lượt `QĐ-93` dưới tên
  `qd93-parameter-labels-dashboard-queues` rồi tách ra.
- Mode: `technical-enabler`.
- Outcome and owner: hai mục của trang tổng quan đọc số đếm thật qua facade mới `RequestsDashboardApi` của `requests` (T5); module
  `dashboards` (T7) capability `employee/`, `manager/`, `section/`.
- Boundaries: chỉ đọc, không bảng, không migration, không transaction ghi; facade mới hai phương thức đếm dùng **cùng điều kiện
  `where`** với hai danh sách nguồn; hai operation đổi dữ liệu trả về (`employeeDashboardGet`, `managerDashboardGet`), enum lý do
  thiếu nguồn bớt một giá trị; quyền không đổi.
- Not larger: các mục `NOT_AVAILABLE` khác (thực chi + cam kết — `g3-downstream-finance-integration`; ghost seat, sai lệch — G7; máy
  chưa xác nhận — sổ thiết bị; tác vụ nền) chưa có nguồn; các mục `AT_SOURCE` (hàng đợi trình, đề xuất ngân sách, dòng phiên bản đã
  duyệt) đếm được nhưng cần facade của `budgets`/`requests` khác và không thuộc finding này. Nhãn tham số vận hành là module và
  consumer khác ⟹ `qd93-parameter-labels-dashboard-queues`.
- Not smaller: hai mục dùng một facade, một lần nối `DashboardsModule` → `RequestsModule`, một lần sửa enum lý do và cùng một suite
  integration; tách thì hai lần đổi đồ thị module và hai lần sinh lại OpenAPI cho cùng schema mục.
- Siblings: `a10-operational-dashboards` (chủ vế "ghép trang Employee" của `US-12-15` AC-2), `a10-manager-dashboard` (chủ vế
  "ghép trang trưởng phòng" của `US-12-15` AC-3), `b03-my-requests` (nguồn `meAccessRequestList`), `b02-need-decision-queue` (nguồn
  `needDecisionList`), `qd93-parameter-labels-dashboard-queues` (giao việc gốc).
- Scope map: n/a

## Primary Story/AC

| Story | AC            | Coverage | Phần còn lại thuộc                                                                                                                                                                 |
| ----- | ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `API-DOC-F06` | n/a      | gỡ chặn `a10-operational-dashboards` (`US-12-15` AC-2 vế "yêu cầu đang chờ và kết quả" trên trang Employee) và `a10-manager-dashboard` (`US-12-15` AC-3 vế "yêu cầu chờ H1 duyệt") |

Hạng mục không đổi chủ AC nào trong scope map G8: `US-12-15` AC-2 vẫn do `a02-my-software-read-model` (chủ) /
`a10-operational-dashboards` (phần còn lại), AC-3 vẫn do `a10-manager-dashboard`; hai hạng mục đó cập nhật bảng phân rã và bằng
chứng của mình sau khi lát này vào `dev` (như tiền lệ `b02-need-decision-queue`). Giữ hạng mục riêng (Owner duyệt 01/11/2026 —
mục `## Quyết định kỹ thuật (Owner duyệt 01/11/2026)`); đã loại: gộp vào hai hạng mục `a10-*`.

## Supporting references

- `US-12-15` AC-2 ("trang hiện … yêu cầu đang chờ và kết quả"), AC-3 ("trang hiện yêu cầu chờ `H1` duyệt"), _Phạm vi quyền_ của Story.
- `US-16-01` AC-2 (`b03-my-requests`: "Yêu cầu của tôi", `view=open|ended`), `US-05-04` hàng đợi duyệt nhu cầu (`b02-need-decision-queue`).
- Module card `src/modules/dashboards/README.md` (bất biến: số `COUNTED` bằng tổng của operation `sourceOperationId` khi cùng người
  gọi đọc; mục chưa có nguồn không bao giờ là 0), ADR-0019 (tầng, facade `public/`).

## Explicit out of scope

- Đếm mục `AT_SOURCE` (hàng đợi trình duyệt chi, đề xuất ngân sách, dòng phiên bản đã duyệt) hay mục `NOT_AVAILABLE` khác.
- Đổi `meAccessRequestList`, `needDecisionList` (route, lọc, thứ tự, quyền) và luật định tuyến bước nhu cầu (thuộc
  `qd93-remove-fallback-substitute-approvers` khi bỏ approver dự phòng — số đếm tự theo vì dùng cùng điều kiện).
- Trang IT Admin, Super Admin, Finance/Người duyệt chi; Mobile (dùng cùng route).

## Dependencies and blockers

- Không blocker để **bắt đầu**: hai nguồn đã có ở `1a77ffe8`. Hạng mục `a10-*` đang `verified (local)` theo roadmap nhưng code
  của chúng đã có trong `dev` `1a77ffe8` (finding FE đọc từ đó).
- Thứ tự **merge** (lượt `QĐ-93`, sóng W4; merge từng hạng mục một, rebase lên `dev` ngay trước khi merge): hạng mục này merge
  **sau** `qd93-direct-manager-spending-approver-roles` và **sau** `qd93-remove-fallback-substitute-approvers` phase A (hai hạng mục
  đó ra cùng một bản phát hành). Lý do: số đếm phụ thuộc định tuyến và vai —
  - fallback phase A đổi `HELD_ROUTING_ROWS`/định tuyến bước nhu cầu; số đếm dùng **cùng** hàm điều kiện với `needDecisionList`
    nên không cần sửa thêm, nhưng ca integration phải dựng bước theo định tuyến mới và chạy lại trên `dev` đã có phase A;
  - hạng mục vai (`QĐ-93a`) rà các chỗ đọc vai `MANAGER`, gồm `manager-dashboard.service.ts`, và đổi cách harness dựng trưởng
    phòng: hạng mục này rebase lên đó, giữ kiểm vai mới, chỉ thêm mục `needApprovals`.
- Migration: không có. Nếu implementation buộc phải thêm, áp quy tắc timestamp chung của lượt: timestamp thật lúc tạo, đổi lại cho
  lớn hơn migration mới nhất trên `dev` trước merge và thêm vào `scripts/verify/merged-migrations.txt` trong lần merge.

## Ownership: module, data, API

- `requests` (T5): facade mới `src/modules/requests/public/requests-dashboard.api.ts` (`RequestsDashboardApi`), export ở
  `requests.module.ts`, thêm `'RequestsModule: RequestsDashboardApi'` vào `PUBLIC_CONTRACT_EXPORTS` của
  `test/gates/module-graph.gate-spec.ts`; `MyRequestsRepo` thêm `countOf(filter)` dùng chung `whereOf`;
  `NeedDecisionQueueRepo` tách `openWhere(employeeId, type?)` dùng cho cả `pageOpenOf` và `countOpenOf(employeeId)`. Không bảng,
  không SQL mới ngoài hai câu `count`.
- `dashboards` (T7): `DashboardsModule` import `RequestsModule`; `employee/employee-dashboard.service.ts`,
  `manager/manager-dashboard.service.ts` đọc qua facade; `section/dashboard-section.policy.ts` bỏ lý do
  `REQUEST_QUEUE_NOT_DELIVERED`. Cạnh mới `dashboards → requests` (T7 → T5, hợp tầng); `docs/generated/module-graph.md` sinh lại.
- API: `employeeDashboardGet` (`GET /api/v1/dashboards/employee`), `managerDashboardGet` (`GET /api/v1/dashboards/manager`) — cùng
  route, quyền, schema mục; giá trị của hai mục đổi; enum `reason` của mọi mục bớt `REQUEST_QUEUE_NOT_DELIVERED`. Giữ nguyên mọi
  route của `requests`.

## Behavior and design

### Facade

```ts
@Injectable()
export class RequestsDashboardApi {
  constructor(
    private readonly myRequests: MyRequestsRepo,
    private readonly needQueue: NeedDecisionQueueRepo,
  ) {}

  /**
   * The requests the person sent that are not over (the `open` view of "my requests"), or null for a caller who sends none (the
   * Super Admin): that list refuses them, so there is no number to show.
   */
  async openRequestsSentBy(actor: { employeeId: string; roles: readonly string[] }): Promise<number | null>;

  /** The need steps that wait for the person now, as the need-decision queue counts them. */
  needDecisionsHeldBy(employeeId: string): Promise<number>;
}
```

- `openRequestsSentBy`: `mayRequest(actor.roles)` sai ⟹ `null`; còn lại `MyRequestsRepo.countOf({ requesterEmployeeId,
states: statesOf('open', undefined) })` — đúng điều kiện của `meAccessRequestList?view=open` (không nháp, không yêu cầu người khác
  gửi thay, gồm cả yêu cầu chờ IT Admin đóng tác vụ rút). Không lọc `type`/`from`/`to`.
- `needDecisionsHeldBy`: `NeedDecisionQueueRepo.countOpenOf(employeeId)` — đúng `where` của `needDecisionList` không lọc `type`
  (bước `NEED` `PENDING` giao cho người đó ở các dòng định tuyến được giữ, trừ yêu cầu của chính họ).
- Facade không **phân quyền** (như `LicensingDashboardApi`, `PersonnelDashboardApi`): dashboards đã kiểm vai và phạm vi của trang.
  Ngoại lệ duy nhất, có chủ ý: `openRequestsSentBy` đọc `actor.roles` qua `mayRequest` để trả `null` cho Super Admin. Đó không
  phải kiểm quyền mà là **chính luật từ chối của danh sách nguồn** (`MyRequestsService` ném `AccessRequestSuperAdminCannotRequestError`
  theo `mayRequest`, `my-requests.service.ts:47`): giữ trong `requests` để `dashboards` không chép một luật của `requests` (chuyển
  sang `EmployeeDashboardService` sẽ là bản thứ hai của luật "Super Admin không gửi yêu cầu", lệch khi luật đổi). Comment của facade
  và module card ghi đúng câu này thay cho "không kiểm vai".

### Trang tổng quan

- Employee: `requests` = `null` ⟹ `notAvailable('NO_DATA_SOURCE')` (tài khoản Super Admin có vai `EMPLOYEE` mở được trang này
  nhưng Super Admin không gửi yêu cầu — `meAccessRequestList` từ chối họ); ngược lại `counted(n, 'meAccessRequestList')`. FE mở danh sách bằng `meAccessRequestList?view=open` (cùng số) và xem kết
  quả bằng `view=ended`. Số đếm là "đang chờ" (Owner duyệt 01/11/2026): AC-2 nói "yêu cầu đang chờ và kết quả", một mục chỉ mang
  một số.
- Trưởng phòng: `needApprovals` = `counted(n, 'needDecisionList')`, sau các kiểm hiện có (vai `MANAGER`, đang làm trưởng một phòng).
- `MISSING_SOURCE_REASONS` bỏ `REQUEST_QUEUE_NOT_DELIVERED` (không mục nào còn dùng); module card và comment của hai service sửa câu
  "not delivered yet".
- Số câu lệnh: mỗi trang thêm đúng một câu `count`; không đọc dòng.
- Nhất quán: số đếm và danh sách là hai lần đọc riêng (như các mục `COUNTED` khác); một yêu cầu đổi trạng thái giữa hai lần gọi có
  thể làm lệch tạm thời — chấp nhận, ghi ở mô tả OpenAPI của mục như hiện hành.

### Tương thích và thay đổi contract cho FE

- `employeeDashboardGet.sections.requests` và `managerDashboardGet.sections.needApprovals`: từ `NOT_AVAILABLE` sang `COUNTED`
  (`count`, `sourceOperationId`); Super Admin ở trang Employee nhận `NOT_AVAILABLE` `NO_DATA_SOURCE`.
- Enum `reason` (schema mục dùng chung bốn trang) bớt `REQUEST_QUEUE_NOT_DELIVERED`: client sinh mã có nhánh cho giá trị đó cần bỏ;
  server không còn trả giá trị đó.
- Báo FE trong PR: FE có thể bỏ lời gọi thẳng hai route chỉ để lấy số (ghi chú của `API-DOC-F06`).

### Không áp dụng

Migration, ghi, transaction, khóa, job, storage, audit: không áp dụng (chỉ đọc).

## Quyết định kỹ thuật (Owner duyệt 01/11/2026)

1. Giữ hạng mục riêng này (technical-enabler, chủ AC không đổi). Đã loại: gộp vào `a10-operational-dashboards` /
   `a10-manager-dashboard` như một sửa lỗi của chúng.
2. Mục `requests` của Employee đếm yêu cầu **đang chờ** (`view=open`); kết quả xem bằng `meAccessRequestList?view=ended`. Đã loại:
   đếm cả yêu cầu đã kết thúc trong cùng mục.

## Test matrix

| AC / rủi ro                       | Tình huống (gồm từ chối, edge case)                                                                    | Cấp test                                                                                                                                                 | Kết quả mong đợi                                                                                                          | Bằng chứng sau implement |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Facade = danh sách (Employee)     | `E1` có yêu cầu đang chờ, đã xong, bị từ chối, đã rút, nháp, và yêu cầu trưởng phòng gửi thay cho `E1` | integration `test/integration/requests/requests-dashboard-facts.integration-spec.ts`                                                                     | `openRequestsSentBy` = `totalItems` của `GET /me/access-requests?view=open` của `E1`; nháp và yêu cầu gửi thay không tính | planned                  |
| Facade = danh sách (trưởng phòng) | `H1` giữ bước nhu cầu đơn lẻ, nhóm, của chính mình; bước đã quyết; bước chuyển cho người khác          | integration như trên                                                                                                                                     | `needDecisionsHeldBy` = `totalItems` của `GET /need-decisions` của `H1`                                                   | planned                  |
| Super Admin                       | Super Admin có vai `EMPLOYEE` gọi trang Employee                                                       | unit `src/modules/dashboards/employee/employee-dashboard.service.spec.ts`; integration `test/integration/dashboards/dashboards-http.integration-spec.ts` | `requests` `NOT_AVAILABLE` `NO_DATA_SOURCE`, không số                                                                     | planned                  |
| `API-DOC-F06` Employee            | `E1` mở trang; người không có yêu cầu nào                                                              | unit như trên; integration `dashboards-http.integration-spec.ts`                                                                                         | `COUNTED` đúng số, `sourceOperationId` `meAccessRequestList`; 0 thật cho người không có gì                                | planned                  |
| `API-DOC-F06` trưởng phòng        | `H1` mở trang; trưởng phòng khác không giữ bước nào                                                    | unit `src/modules/dashboards/manager/manager-dashboard.service.spec.ts`; integration như trên                                                            | `COUNTED` đúng số, `sourceOperationId` `needDecisionList`; không đếm bước của người khác                                  | planned                  |
| Lý do thiếu nguồn                 | danh sách lý do và schema OpenAPI của mục                                                              | unit `src/modules/dashboards/section/dashboard-section.policy.spec.ts`; HTTP `test/http/dashboards/dashboards.http-spec.ts`                              | không còn `REQUEST_QUEUE_NOT_DELIVERED`; các mục khác giữ lý do cũ                                                        | planned                  |
| Quyền không đổi                   | vai khác gọi hai trang; không token                                                                    | HTTP `dashboards.http-spec.ts`; integration hiện có                                                                                                      | 401/403 như trước                                                                                                         | planned                  |
| Ranh giới module                  | facade mới, cạnh `dashboards → requests`, export Nest                                                  | gate `test/gates/module-graph.gate-spec.ts`, `pnpm arch:check`, `pnpm arch:docs:check`                                                                   | xanh với `PUBLIC_CONTRACT_EXPORTS` mới; không cạnh ngược tầng                                                             | planned                  |
| OpenAPI                           | `openapi.json` sinh lại                                                                                | HTTP `test/http/platform/openapi-export.http-spec.ts`, `api-inventory.http-spec.ts`                                                                      | chỉ enum `reason` đổi; không operation mới                                                                                | planned                  |

## Definition of Done

- [ ] `API-DOC-F06` có test đỏ-trước/xanh-sau (unit + integration so với tổng của operation nguồn).
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối: `pnpm check`, `pnpm test:http`,
      `pnpm test:integration -- test/integration/dashboards test/integration/requests/requests-dashboard-facts.integration-spec.ts`,
      `pnpm openapi:export` không diff.
- [ ] Spec/plan phản ánh implementation cuối; thay đổi contract ghi ở PR và báo FE; báo chủ AC (`a10-operational-dashboards`,
      `a10-manager-dashboard`) cập nhật bảng phân rã/bằng chứng; roadmap do người điều phối cập nhật.
- [ ] Module card `dashboards` và `requests` cập nhật (facade, mục, phụ thuộc); không tăng legacy ledger kiến trúc.

## Changes and acceptance

- 01/11/2026: tạo spec/plan bản `draft` từ Docs `69e8a3d`, BE `1a77ffe8`, tách khỏi `qd93-parameter-labels-dashboard-queues`. Chưa
  peer review, chưa Owner review, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (giữ hạng mục riêng; mục `requests` đếm yêu cầu đang chờ `view=open`); thiết kế
  vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa sau audit độc lập (AI theo giao việc điều phối; đã đối chiếu `mayRequest` ở `1a77ffe8`; `D-S26`, Docs chưa
  commit): **L8** câu "facade không kiểm vai" sai vì `openRequestsSentBy` quyết ca Super Admin theo vai — giữ trong facade (là luật
  từ chối của chính danh sách nguồn, không phải phân quyền) và ghi rõ lý do; phụ thuộc đổi thành thứ tự merge W4 cứng (sau hạng mục
  vai và fallback phase A, vì số đếm phụ thuộc định tuyến); ghi không có migration; plan thêm dòng quyền chạy test `D-S26`.
