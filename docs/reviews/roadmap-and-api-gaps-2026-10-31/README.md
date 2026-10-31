# Audit roadmap và phân việc BE — 31/10/2026

## Kết luận

G0–G6 đã có phần lõi trong source; **không nên giao lại toàn bộ G3/G4 hoặc coi mọi G0–G6 đã xong**. Còn API đọc phục vụ
FE, một điều kiện khóa tham số G2, cảnh báo license và các vế phụ thuộc device/usage/chi phí. G7–G10 còn phần BE lớn
chưa hiện thực, nhưng một số API của G8/G10 cần kéo lên làm ngay để dùng được luồng G5.

Hai danh sách đề xuất: [Dev A](DEV-A.md) — catalog/licensing/subscription renewal và BE phục vụ Mobile;
[Dev B](DEV-B.md) — Request/budget/actual cost/reporting và G9. Đây là **đề xuất giao việc**, chưa phải spec đã duyệt
hay bằng chứng nghiệm thu.

### Phạm vi phân công cập nhật theo Owner — 31/10/2026

- **Owner tự làm toàn bộ G7 và Tools**: device registry, ingest, usage engine/rules, recommendation, privacy usage,
  cùng các vế onboarding/ngừng phòng/long-leave/ghost phụ thuộc G7. Hai dev không implement lại các phần này.
- **Bên AI làm phần AI của G10** (`US-15-05`, `US-15-06`); không giao thiết kế/implement AI cho A hoặc B trong hai list.
- A/B nhận phần còn lại G0–G6, API GAP, G8/G9 và **phần BE phục vụ Mobile của G10**. Ứng dụng native thuộc phía Mobile;
  danh sách này không giao hai dev BE viết UI native. API hiện hữu đủ contract thì tái dùng, không xây backend riêng.
- A-05 chỉ làm tích hợp K4 của G3/G4/G6 sau contract thiết bị từ Owner; device registry vẫn thuộc G7 của Owner.
  B-08 làm phép tính chi phí/savings từ evidence G7, không nhận engine phát hiện không dùng.
- Gia hạn subscription chuyển từ B-06 sang A-06; Mobile chuyển thành A-07→A-09 và B-10 hỗ trợ phần Request/budget.
  Các mã task A-06→A-08/B-10 của bản phân việc trước đã đổi scope; nội dung hiện tại thay thế đề xuất cũ.

## Baseline và giới hạn

- BE: `eb41f9cc7aea11cbb4423c90a6f837d216ed14d0`; tracked working tree sạch lúc bắt đầu.
- Docs: `d6d868c8b88a3da569b0d3d5119af8a9cae36660`; tracked working tree sạch lúc kiểm tra; BRD v3.57.
- Đối chiếu roadmap, khung deferred G2–G6, spec các GAP, source/controller/guard, module mount, OpenAPI, test liên quan,
  handoff cuối 31/10 và handoff Tools. Không kiểm chứng lại từng AC của toàn bộ US; không suy tỷ lệ hoàn thành từ số API.
- Kiểm tra thực chạy trong lượt audit: API inventory HTTP **9/9 đạt**, `arch:docs:check` đạt; 287 operation trong
  `openapi.json`. HTTP contract app dùng dependency giả, không chứng minh dữ liệu/runtime trên VPS.
- Kết quả full unit/integration/E2E/image trước đó là bằng chứng được báo cáo ở plan/handoff, không phải lần chạy lại
  trong audit này. Không gọi API VPS, đổi DB, đọc `.env`, commit hay push.
- [Review 2](../../../../../Docs/Reviews/review2-main-flows-process-policy-2026-10-31/REPORT.md) ghi các quyết định phiên
  và đề xuất chưa đồng bộ BRD/QĐ/US. Khi nhận task phải lấy các quyết định phiên liên quan từ Owner, ghi lại và đồng bộ
  spec/nguồn có thẩm quyền trước phần implement phụ thuộc; không tự bỏ qua hoặc coi toàn bộ đề xuất đã thành baseline.

Nguồn bắt đầu:
[roadmap](../../roadmap.md), [routes](../../generated/routes.md), [module mount](../../../src/app/app.module.ts),
[handoff hiện hành](../../../../../Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/CURRENT-HANDOFF.md),
[review độc lập 31/10](../../../../../Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/09-independent-verification-2026-10-31.md).

## Findings cần hành động

| Mã    | Ưu tiên giao việc   | Kết luận và ảnh hưởng                                                                                                                            | Xử lý / chủ đề xuất                                                                |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| RA-01 | P0                  | API-GAP-02: Employee chưa có contract danh mục/gói để bắt đầu Request; API catalog hiện chỉ IT Admin/Finance đọc.                                | A-01; đóng lỗ hổng luồng G5, không mở nguyên DTO quản trị cho Employee.            |
| RA-02 | P0                  | API-GAP-03a: có quyết nhu cầu theo ID, thiếu danh sách việc đang giao cho người duyệt nhu cầu.                                                   | B-02; lấy việc theo người được giao hiện hành, không chỉ theo phòng.               |
| RA-03 | P0                  | API-GAP-01: có draft list, detail và thao tác Request, thiếu list các Request đã gửi của chính Employee.                                         | B-03; làm sớm phần đọc G8/G10, không chờ toàn bộ dashboard/mobile.                 |
| RA-04 | P0                  | G2 `US-01-04 AC-8`: có ngân sách nhưng đường đổi tháng bắt đầu năm tài chính chưa khóa theo điều kiện đã có phiên bản.                           | B-01; sửa invariant, kiểm cả race với việc tạo phiên bản đầu tiên.                 |
| RA-05 | P1 / cần chốt scope | API-GAP-03b: chưa có list IT assessment, nhưng spec hiện chủ động không chứa list. Chưa đủ căn cứ gọi một endpoint queue riêng là AC bị vi phạm. | B-04; chốt list riêng hay danh sách việc IT chung trước thiết kế contract.         |
| RA-06 | P1                  | F58 vẫn là phần deferred về đưa cảnh báo license vào inbox; đã có inbox và nhiều thông báo Request/nhân sự/ngân sách.                            | A-03; chỉ bổ sung sự kiện license còn thiếu, không viết lại notification platform. |
| RA-07 | P1                  | Nhiều trạng thái/blocker trong roadmap là lịch sử, dễ khiến giao trùng phần đã có source.                                                        | B-00 tổng hợp; từng dev cập nhật coverage của phần mình, Owner tích hợp roadmap.   |
| RA-08 | P1 / vận hành       | Demo dataset đã nạp, nhưng lỗi kết nối của lần chạy lại CLI chưa được chốt nguyên nhân.                                                          | A-04, tách khỏi tính năng API; không mặc định reset/nạp lại VPS.                   |

P0/P1 là thứ tự đề xuất trong lần phân việc này, không thay mức severity hay ưu tiên nghiệp vụ của US.

### Bằng chứng riêng RA-04

[US-01-04](../../../../../Docs/BE-UserStory/src/EP-01.md) AC-8 cấm đổi tháng sau khi đã có phiên bản ngân sách, không
chỉ sau khi phiên bản được duyệt. [G2 downstream](../../workspace/items/g2-downstream-integration/spec.md) giữ đúng vế
này để làm trước phiên bản đầu tiên. Hiện [OperatingParametersApi.set](../../../src/modules/operating-parameters/public/operating-parameters.api.ts)
chỉ khóa theo key, kiểm miền/tương quan giá trị rồi ghi tham số và audit; [repo](../../../src/modules/operating-parameters/operating-parameters.repo.ts)
không hỏi trạng thái ngân sách. Không tìm thấy trigger bảo vệ điều kiện này trong migrations. Test hiện có kiểm
miền tháng và việc bỏ loại kỳ, chưa thấy ca sau khi tạo phiên bản. Đây là finding từ source, **chưa tái hiện trên DB**.

## Đối chiếu các API GAP trong ảnh

| GAP                     | Source hiện hành                                                     | Bằng chứng API/source                                                                                                                                                     | Kết luận giao việc                                                                                          |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 01 — Yêu cầu của tôi    | `US-12-15 AC-2`, `US-16-01 AC-2`; hành vi trạng thái theo `US-05-15` | `GET /access-requests/drafts` và `GET /access-requests/{id}` tồn tại; không có list Request đã gửi theo chính người dùng.                                                 | Thiếu thật; B-03, một read model dùng chung web/mobile. Draft list không thay thế được.                     |
| 02 — Chọn phần mềm/gói  | `US-05-01`, phần mở danh mục → chọn gói → preview                    | `GET /applications`, `GET /plans` và detail tương ứng chỉ `IT_ADMIN`, `FINANCE`. Spec preview đã loại danh mục Employee và trông vào `/standard-toolsets/mine` nay đã bỏ. | Thiếu thật; A-01. Không phục hồi bộ công cụ chuẩn đã retired.                                               |
| 03a — Chờ duyệt nhu cầu | `US-05-04` main flow mở hàng đợi → đọc → quyết                       | Có `POST /access-requests/{id}/need-decision`, quyết theo dòng nhóm và detail; không có list bước nhu cầu đang giao.                                                      | Thiếu thật; B-02. Dùng cho cả Manager, Người duyệt chi/approver dự phòng khi họ giữ bước nhu cầu.           |
| 03b — Chờ IT thẩm định  | `US-05-06`; spec assessment hiện không chứa list                     | Có đọc/sửa/hoàn tất/từ chối assessment theo ID; chưa có endpoint list assessment.                                                                                         | Thiếu bề mặt khám phá công việc; B-04 sau chốt scope. Không gán một AC queue riêng chưa được nguồn xác lập. |

Đường dẫn bảng bỏ prefix `/api/v1`. Tên route mới phải chốt trong spec/OpenAPI; báo cáo không tự quyết contract.

Bằng chứng trực tiếp:
[applications controller](../../../src/modules/catalog/catalog-entry/applications.controller.ts),
[plans controller](../../../src/modules/catalog/plan/plans.controller.ts),
[preview spec](../../workspace/items/g5-request-preview/spec.md),
[US EP-05](../../../../../Docs/BE-UserStory/src/EP-05.md),
[US EP-12](../../../../../Docs/BE-UserStory/src/EP-12.md),
[US EP-16](../../../../../Docs/BE-UserStory/src/EP-16.md).

**Phần đọc cần kiểm kê thêm ngay khi làm G8:** “Phần mềm của tôi” (`US-12-15 AC-2`, `US-16-01 AC-1`).
[Assignment list](../../../src/modules/licensing/assignment/assignments.controller.ts) hiện chỉ IT Admin;
`GET /saas-issues/options` có danh sách quyền có thể báo lỗi nhưng được định nghĩa cho form báo lỗi, không phải contract
tổng quan mọi phần mềm K1–K5 của Employee. A-02 phải đối chiếu khả năng tái dùng projection, ngày hết hạn và K4/K5,
không kết luận BE chưa có bất cứ dữ liệu assignment cá nhân nào.

**Đã có, không giao viết lại:** finance-review queue, spend-submission queue, spend-approval queue, provisioning queue,
notifications, expiry queue/reminder reader, handover duties, transfer reviews và SaaS issue list. Queue nhu cầu và IT
assessment không đồng nghĩa với những queue này; không dùng FE quét mọi ID hoặc giả lập danh sách từ inbox.

## G0–G6: đã có gì, còn gì

“Có lõi” ở đây là hiện diện trong source/contract và có test hoặc evidence liên quan; không đồng nghĩa mọi Story đã
accepted hay đã kiểm thử lại trên VPS.

| G   | Phần lõi đã có                                                                                                                                                                                                           | Phần còn lại phải phân biệt                                                                                                                                                                                                                                                     | Chủ đề xuất                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| G0  | Bootstrap, transaction/audit, primitives, ranh giới module, H7/runtime-role và preflight/CLI. Refactor cuối tháng đã vào `eb41f9c`.                                                                                      | Seed CLI chạy lại (RA-08); CI/Owner acceptance và H7 reconcile/verify ở target deploy là checkpoint vận hành, không phải viết lại foundation.                                                                                                                                   | A-04; Owner giữ release/acceptance.                              |
| G1  | Internal auth/session, invitation/reset/change password, role/account administration, audit query, Super Admin transfer/recovery.                                                                                        | Không phát hiện API lõi G1 mới bị thiếu trong kiểm tra này. Quyền cho các API mới và phần privacy/xóa/giả danh hóa usage còn theo G7; không claim toàn bộ `US-01-05` đã phủ các G tương lai.                                                                                    | A-09 và quyền các API mới của từng dev; privacy usage: Owner/G7. |
| G2  | Phòng/trưởng phòng, Cost Center, Employee/intake/import, dự án, tham số và onboarding. Source đã chuyển thao tác tổ chức/nhân sự theo baseline Super Admin.                                                              | RA-04; onboarding step 5 usage còn `NOT_AVAILABLE`; ngừng phòng đã có open Request/personnel work, nhưng chưa có đóng góp khuyến nghị G7; không giữ blocker “chưa có G5/G6” cho mọi vế.                                                                                         | B-01; onboarding/khuyến nghị G7: Owner.                          |
| G3  | Application/vendor/plan/subscription/contract documents/key vault; money/rates/tax profile; ownership theo baseline mới.                                                                                                 | A-01 là lỗ hổng đọc G3→G5; device/K4/BM-06 (`US-04-04 AC-8`, `US-04-11 AC-10`, `US-04-12 AC-5→8`); quyền/chứng từ hóa đơn và thuế thực tế G8/G9 (`US-04-04`, `US-12-09 AC-9`). Bộ chuẩn và chia chi phí tỷ lệ đã retired, không là việc còn thiếu.                              | A-01/A-05; B-07/B-08; registry G7: Owner.                        |
| G4  | Baseline import, assignment/capacity, provisioning/manual completion/failure/retry; nối Request tới cấp và trả kết quả đã có.                                                                                            | Device-dependent K4 (`US-07-01 AC-10`, `US-07-02 AC-4`); connectors theo scope G7 được chốt; F58 inbox; số liệu chi phí khi cấp thất bại chờ G8. Khung request/transfer integration phải re-audit từng vế, không implement lại cả khung.                                        | A-03/A-05; B-07; connector/registry G7: Owner.                   |
| G5  | Draft/preview/submit, need decision, proposal assessment/internal, group/service-account, routing/reassignment/controlled wait, return/renewal, status/SLA, Finance review, spend approval, budget versions/commitments. | GAP-02/03a; GAP-03b cần chốt; GAP-01 là read model G8/G10 phục vụ G5. Chuyển commitment thành chi phí theo invoice, phần hoàn tiền/đã chi khi rút hoặc cấp thất bại, budget actual read model còn G8/G9. F35 về kỳ hủy được phải chốt chính sách giá ở G8.                      | A-01; B-02/B-03/B-04/B-05/B-07/B-08.                             |
| G6  | Personnel notices/evidence, transfer và rà soát, long leave, offboarding, role/workspace/service-account handover, expiry, leaver closure, SaaS issues.                                                                  | Miễn loại trừ usage khi nghỉ dài, G2 ghost decision và vòng thu hồi theo rule G7; device revoke K4; chi phí/ngày, tiết kiệm, chi phí chờ xác nhận/giữ tới cuối kỳ chờ G8; F58 nhắc qua inbox. Gia hạn quyền cá nhân/renewal hold đã có, không nhầm với gia hạn subscription G8. | A-03/A-05; B-07/B-08; usage/ghost G7: Owner.                     |

### Khung deferred phải xử lý theo từng vế

| Khung                                 | Còn thật / cách đóng đúng                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g2-downstream-integration`           | AC-8 khóa tháng chưa có; thời hạn nhắc Request/SaaS issue đã có phần source; open work Request/personnel đã có listener; chỉ mở phần còn thiếu và G7 recommendation.            |
| `g3-downstream-finance-integration`   | Chứng từ/invoice/actual tax/cost/dashboard còn G8/G9; budget/status notifications đã có một phần G5. Re-pin từng AC theo Docs hiện hành.                                        |
| `g4-device-dependent-features`        | Chưa có device registry/endpoint trong BE mount hiện tại; làm sổ thiết bị tối thiểu trước K4, rồi collector binding.                                                            |
| `g4-request-and-transfer-integration` | Blocker “G5/G6 chưa có” đã lỗi thời. Có grant/outcome listener và renewal hold; rà exact AC `US-07-01 AC-3,16`, `US-07-04 AC-4,15`, `US-01-12 AC-4,8,9` trước khi tạo task sửa. |
| `g4-notification-delivery`            | Inbox đã có, nhưng F58 deferred vẫn cần đóng. Loại phần bộ chuẩn retired, tách auth-failure connector còn phụ thuộc connector thật.                                             |
| `g6-downstream-integration`           | Usage exclusions/ghost recommendation chưa có engine G7; cost savings còn G8. Không mở lại mọi leave/transfer/expiry/handover đã implement.                                     |

Nguồn: khung spec cùng tên trong [items](../../workspace/items/README.md),
[F58](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md#f58--cảnh-báo-license-fr-514),
[F35 disposition](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md),
[onboarding](../../../src/modules/onboarding/README.md),
[department open Requests](../../../src/modules/requests/access-request/open-request/department-open-requests.listener.ts),
[personnel open work](../../../src/modules/personnel/event-notice/department-open-work.listener.ts),
[renewal hold](../../../src/modules/requests/renewal-request/renewal-hold.listener.ts).

## Các G phía sau

| G   | Trạng thái BE và thứ tự đúng                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G7  | Chưa thấy backend device/usage ingestion/recommendation engine được mount. Tools đã có prototype và handoff, không phải chưa nghiên cứu gì. Device registry, G1 seat trống và G2 leaver có thể tách khỏi collector; G3/G4 inactivity chỉ chạy khi đủ coverage/identity/negative evidence. Privacy/retention/consent/notice phải đi cùng dữ liệu usage, không để sau triển khai thu thập thật. |
| G8  | Chưa có đầy đủ quyết định gia hạn/giảm/hủy subscription, invoice/actual tax, cost posting/commitment conversion, period close, snapshot report, savings/dashboard. Budget proposal/version/commitment đã có ở G5; không xây lại. Kéo các read model Employee/Manager lên trước; tách báo cáo không cần usage khỏi KPI cần coverage G7.                                                        |
| G9  | Chưa có chuỗi sao kê CSV → phát hiện → điều tra → hợp thức hóa → đối soát từng khoản chi. Phụ thuộc ledger/chi phí G8. `OOS-24` phải chốt hoặc giới hạn rõ trước `US-13-06`.                                                                                                                                                                                                                  |
| G10 | Auth/inbox/nhiều action đã dùng chung được. Còn read-model gap và kiểm tương thích bốn tác vụ mobile; phần UI native thuộc dev Mobile. Hai tính năng AI chờ handoff/chính sách dữ liệu; không giao 2 dev BE làm lại collector hoặc tự mở rộng thành mobile/AI client.                                                                                                                         |

Handoff G7 do Owner giữ; hai dev đọc phần contract cần tích hợp, không nhận lại G7:
[AI collector](../../../../Tools/workstreams/ai-collector/handoff.md),
[browser extension](../../../../Tools/workstreams/browser-extension/handoff.md),
[vendor sources](../../../../Tools/workstreams/vendor-sources/handoff.md).
Vendor handoff 30/10 ghi positive-only, chưa live API/real export; không có đầu nhận BE. Từ đó không được suy ngày
thiếu dòng thành usage 0 rồi tự sinh khuyến nghị G3/G4. Đây là rule G3/G4 về usage, khác nhóm roadmap G3/G4.

## Cách chia hai dev và tích hợp

| Đợt                          | Dev A                                                                             | Dev B                                                                                                    | Đầu ra kiểm chứng                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1 — gỡ API cần sớm           | A-01 employee selector; A-02 Phần mềm của tôi                                     | B-01 fiscal lock, B-02 need queue, B-03 My requests; B-04 assessment queue khi chốt scope                | Employee chọn/gửi/xem → đúng người mở queue và quyết; không lộ dữ liệu hoặc đổi sai năm ngân sách.                     |
| 2 — hoàn thiện lõi và Mobile | A-03 license inbox, A-04 seed diagnosis; A-07→A-09 Mobile-BE chạy ngay khi API đủ | B-05 đóng exact AC downstream; B-10 bổ sung Request/budget contract cho Mobile; B-07 invoice/actual cost | Bốn Story Mobile có operation mapping và test BE; các source có sẵn được tái dùng.                                     |
| 3 — G8/G9                    | A-06 subscription renewal; A-10 dashboard vận hành                                | B-07 hoàn tất posting/close, B-08 cost/reporting và dashboard tài chính, B-09 reconciliation             | Gia hạn có kết quả; invoice → actual → báo cáo/đối soát đúng; không phụ thuộc toàn bộ usage cho nhánh không cần usage. |
| Khi Owner bàn giao G7        | A-05 tích hợp K4/device của G3/G4/G6; nối evidence vào renewal/dashboard          | B-08 nối evidence G7 vào savings/KPI                                                                     | Test tích hợp thật theo contract/revision G7; không claim hoàn tất bằng mock.                                          |

Mobile không phải chờ xong G8/G9; các P0 và auth/inbox hiện có đủ để bắt đầu A-07→A-09. G7 và AI không được tính
vào tải implement của hai dev. Chỉ phần tích hợp thật sự cần contract bên ngoài mới chờ; phần độc lập tiếp tục.

A sở hữu phần bổ sung `catalog`, `licensing`, subscription renewal và integration/test BE cho Mobile; B sở hữu
`requests`, `budgets`, finance/cost/reporting/reconciliation. Owner sở hữu G7/Tools, bên AI sở hữu AI G10. API public
liên module phải thỏa ADR-0019: không import ngược tier hoặc đọc SQL bảng module khác. Module/tier mới chốt ở thiết kế.

Điểm tránh conflict:

- A-01 là projection catalog an toàn; B dùng catalog public contract, không cùng mở Employee vào DTO quản trị.
- A-06 giữ subscription decision/outcome và licensing; B-07 giữ posting/commitment contract. Gia hạn subscription
  khác gia hạn quyền cá nhân đã có G5/G6; không tạo lại workflow sau.
- A-07→A-09 giữ contract mapping và test integration Mobile-BE; B-02/B-03/B-10 giữ code Request/budget cần bổ sung.
  Finding ở module nào giao đúng owner sửa; không hai dev cùng sửa một controller/repo.
- A-10 giữ dashboard vận hành Employee/Manager/IT/Super Admin, B-08 giữ phép tính tài chính và dashboard Finance/
  Người duyệt chi; phần tiền Manager dùng contract B-08. Ghi đúng từng vế AC của US-12-15, không trùng coverage.
- Owner cung cấp device public contract, evidence/rules/coverage G7; A chỉ tích hợp K4, B chỉ tiêu thụ evidence để
  tính tiền/KPI. Các vế G6 long-leave usage/ghost và G2 onboarding usage/open recommendation vẫn do Owner giữ.
- Migrations, OpenAPI, coverage manifest, app wiring và roadmap: mỗi lần một người tích hợp; sau merge rebase và sinh
  lại artifact. Không chia chung DB test. Owner giữ merge/release/acceptance và kiểm chứng quyền H7 trên target deploy.
- Mỗi package phải phân rã thành outcome/Story/AC trước code. Cân tải sau 2–3 lát đầu, không chia theo số G;
  không tính A-05 chờ G7 hay AI ngoài scope là task sẵn sàng để lấp lịch.

## Điều kiện bàn giao mỗi lát

Theo [workflow và prompt dùng lại](../../workspace/prompts/README.md): pin BE/Docs revision, chỉ rõ Story/AC và phần
loại trừ; spec/plan/test matrix → audit/fix thiết kế → implementation và test → audit code → validate → handoff.
Mỗi outcome là item riêng, ghi scope map trước code theo [sizing](../../rules/work-item-sizing.md).

Với read APIs: test quyền/IDOR, đổi người giữ vai, pagination/filter/order ổn định và dữ liệu bị cấm; thêm contract
vào OpenAPI/manifest. Với invariant: có test tái hiện lỗi và test đồng thời ở PostgreSQL cô lập. Với lifecycle:
thêm retry/idempotency/audit và tình huống đổi trạng thái giữa đọc danh sách và action.

Chạy các lệnh theo CONTRIBUTING/test guide: `pnpm check`, `pnpm test:http`, export OpenAPI; integration cho query/DB/
cross-module; E2E chuỗi bị tác động và regression toàn API theo kế hoạch tại revision bàn giao. Ghi rõ cái gì là
contract mock, DB thật, API thật local/test hoặc target deploy. “Data thật” cho dev nên là dataset nghiệp vụ hợp lệ
có kiểm soát trên môi trường test, không mặc định dùng PII hoặc sửa VPS chung.

Commit/push chỉ theo quyền giao nhánh cá nhân; Owner review và merge. Không tự ghi `accepted`, remote CI xanh hay
target deploy đã kiểm chứng nếu chưa có bằng chứng tương ứng.

## Verification của bộ tài liệu audit

Kết quả API/architecture dưới đây thuộc lượt audit ban đầu trên baseline đã pin; lần điều chỉnh phân công không
chạy lại API/DB tests và không thay source. Rules/format/link được kiểm tra lại cho tài liệu điều chỉnh.

- `pnpm test:http --runInBand --runTestsByPath test/http/platform/api-inventory.http-spec.ts`: 1 suite, 9 test đạt.
- `pnpm arch:docs:check`: đạt.
- `pnpm rules:check`: 323 file, 2 757 link, 0 lỗi; `pnpm rules:format`: đạt.
- Prettier check ba file audit mới: đạt; kiểm tra 35 local file link: đều tồn tại; `git diff --check`: đạt.
- Chỉ thay tài liệu: thêm ba file audit/giao việc, link tại docs index và annotation ở roadmap; không sửa source/test.
