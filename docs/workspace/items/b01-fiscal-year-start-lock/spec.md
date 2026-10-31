# Spec: b01-fiscal-year-start-lock — khóa đổi tháng bắt đầu năm tài chính khi đã có phiên bản ngân sách

- Phụ trách: AI implementer theo giao việc Dev B (`B-01`), sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI implementer theo [DEV-B B-01](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-B.md) và
  [báo cáo audit 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md) (`RA-04`).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `d6d868c` (BRD v3.57, US v0.15 — `US-01-04` AC-8; `QĐ-82e`, `QĐ-82l`(23), `FR-5.1`, `FR-8.2`), BE `6eb12d1`.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`). Lấy vế "khóa" ra khỏi khung
  [g2-downstream-integration](../g2-downstream-integration/spec.md) vì dependency G5 (`US-06-09`, phiên bản ngân sách) đã có.
- [Kế hoạch](plan.md). Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Business outcome

Sau khi có bất kỳ phiên bản ngân sách nào (kể cả bản nháp, bản chưa duyệt, bị từ chối hay đã hết hạn), Super Admin đổi tháng
bắt đầu năm tài chính bị từ chối bằng 409, không đổi giá trị, không ghi audit; đặt đúng giá trị hiện tại không phải thay đổi.
Việc tạo phiên bản đầu tiên và việc đổi tháng không bao giờ cùng thành công trên câu trả lời cũ (race). Kiểm được bằng HTTP
integration và test đồng thời trên PostgreSQL thật, cô lập theo từng file.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục); Dev B backlog `B-01`; finding `RA-04`.
- Mode: `split-story`.
- Outcome and owner: khóa tháng bắt đầu năm tài chính theo phiên bản ngân sách; capability `operating-parameters` (sở hữu
  tham số, điểm mở, lỗi) và `budgets/version` (bên biết phiên bản nào tồn tại).
- Boundaries: một transaction ghi (đặt tham số + audit) trên `parameter_values`/`audit_events`; đọc `budget_versions` chỉ qua
  `budgets` (không truy vấn bảng budgets từ operating-parameters, không import ngược tầng — extension point của
  [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md)); không migration; không route mới (thêm mã lỗi 409 vào
  `PUT /api/v1/operating-parameters/{key}`); quyền không đổi (chỉ `SUPER_ADMIN`).
- Not larger: AC-15 (thời hạn chờ trình và tham số phiếu báo lỗi) và `US-03-06` AC-19 chờ G5–G7 khác, vẫn ở khung
  `g2-downstream-integration`; `AC-8` vế "không có tham số loại kỳ" đã thuộc `g2-fiscal-year-operating-parameters`.
- Not smaller: guard, lỗi, serialization với tạo phiên bản đầu và test race cùng bảo vệ một bất biến; tách guard khỏi
  serialization làm guard có lỗ hổng race, tách theo tầng controller/service/repo không phải lý do.
- Siblings: `g2-fiscal-year-operating-parameters` (vế không có loại kỳ của AC-8), `g2-downstream-integration` (AC-15,
  `US-03-06` AC-19).
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2) — dòng `US-01-04` AC-8 hiện ghi chủ sở hữu vế khóa là
  `g2-downstream-integration`; coordinator đổi sang `b01-fiscal-year-start-lock` khi merge roadmap.

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                                                                  |
| ---------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-01-04` | AC-8 | partial  | vế không có tham số loại kỳ: `g2-fiscal-year-operating-parameters`; AC-15: `g2-downstream-integration` (phần còn lại của Story đã giao ở `g2-operating-parameters`) |

Vế sở hữu ở đây, chính xác: AC-8 — "Given đã có phiên bản ngân sách năm 2026 của `CC-A`, When Super Admin đổi tháng bắt đầu
năm tài chính từ tháng 1 sang tháng 4, Then bị từ chối". Mở rộng theo nguồn nghiệp vụ: điều kiện là **bất kỳ** phiên bản (mọi
Cost Center, mọi năm, mọi trạng thái), vì "đặt một lần, không đổi khi đã có phiên bản ngân sách" (bảng tham số của `US-01-04`)
và Postconditions "Thất bại/từ chối → tham số không đổi", Audit Trail chỉ ghi thay đổi thành công.

## Supporting references

`FR-5.1`, `FR-8.2`, `QĐ-82e`, `QĐ-82l`(23); `US-06-09` (phiên bản ngân sách, Finance tạo phiên bản đầu); ADR-0019 (extension
point), ADR-0016 (budgets); [G2 scope map](../../../roadmap.md#work-item-decomposition-g2).

## Explicit out of scope

- AC-15 và `US-03-06` AC-19: `g2-downstream-integration`.
- Đề xuất ngân sách (`budget_proposals`) **không** khóa tháng: AC chỉ nói phiên bản ngân sách. Một đề xuất đã gửi trước lúc
  đổi tháng giữ `year` đã tính; chưa có AC cho việc này (ghi ở `## Open decisions`).
- Cờ `locked` trong `GET /operating-parameters` cho FE vô hiệu hóa ô nhập: không thêm (đổi wire, chưa có yêu cầu).
- Writer ngoài ứng dụng (SQL tay, migration) không đi qua khóa này; không thêm trigger DB vì trigger trên `parameter_values`
  phải đọc bảng của budgets, trái ranh giới sở hữu bảng (`docs/rules/database-business.md`).

## Dependencies and blockers

Không blocker: `budget_versions` và `POST /budget-versions` (`US-06-09`) đã có. Không migration. Cần coordinator: dòng roadmap,
mục `PUBLIC_CONTRACT_EXPORTS` của gate `module-graph`, `openapi.json` và artefact sinh (xem plan).

## Ownership: module, data, API

- `operating-parameters` (tầng T3) mở `ParameterLockContributions` (`public/operating-parameters.extension-points.ts`,
  `Contributions<ParameterLockReader>`), thêm `OperatingParametersApi.holdValue(tx, key)` và `ParameterChangeService`
  (`parameter-change.service.ts`, chuyển `set` ra khỏi facade; chỉ `OperatingParametersHttpModule` dùng — controller là caller
  duy nhất, nên graph worker/CLI không "dùng" điểm mở và gate `extension-wiring` không cần ngoại lệ). Lỗi `ParameterLockedError`
  ánh xạ 409 `PARAMETER.LOCKED` ở `operating-parameters.http-errors.ts`.
- `budgets` (tầng T5) đăng ký `FiscalYearStartLockReader` (`version/fiscal-year-start-lock.listener.ts`,
  `budgets.fiscal-year-start`) bằng `onModuleInit`; `VersionRepo.anyExists(tx)` đọc `budget_versions`; `VersionCreationService`
  đọc tháng qua `BudgetSupportService.holdFiscalYearStartMonth(tx)` → `OperatingParametersApi.holdValue`.
- Bảng đọc: `budget_versions` (chỉ budgets). Bảng ghi: `parameter_values`, `audit_events` (không đổi). Không bảng/cột mới.
- API: `PUT /api/v1/operating-parameters/{key}` thêm phản hồi 409 `PARAMETER.LOCKED` (`details: { key, reason }`,
  `reason = BUDGET_VERSION_EXISTS`); không route mới, request/response thành công không đổi.

## Behavior and design

**Thứ tự trong `ParameterChangeService.set`** (một transaction): khóa độc quyền key (`pg_advisory_xact_lock` trên
`operating-parameter:<key>`, sẵn có) → đọc giá trị hiện hành → kiểm miền giá trị (422 nếu sai) → cùng giá trị thì kết thúc,
không ghi (200 no-op) → hỏi từng reader của key (409 nếu có reader trả lý do) → đóng dòng cũ, thêm dòng mới, ghi audit.
Từ chối ném trước mọi lệnh ghi nên transaction hoàn tác: không đổi giá trị, không dòng lịch sử, không audit.

**Guard liên module.** operating-parameters không biết budgets: nó hỏi các `ParameterLockReader` đã đăng ký (cùng kiểu
`CostCenterUseContributions` của organization). Reader của budgets trả `BUDGET_VERSION_EXISTS` khi `budget_versions` có ít nhất
một dòng, bất kể trạng thái (`DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `SUPERSEDED`, `EXPIRED`).

**Serialization với tạo phiên bản đầu tiên.** Check-then-act đơn thuần có race: Finance đọc tháng 1, Super Admin đổi sang 4
(chưa có phiên bản), Finance commit phiên bản dưới tháng 1. Để loại: `VersionCreationService.createFromProposal` đọc tháng
**trong transaction** bằng `holdValue`, lấy `pg_advisory_xact_lock_shared` trên cùng key và giữ tới commit; `set` giữ khóa
độc quyền cùng key. Hai người tạo phiên bản không chờ nhau (shared); đổi tháng chờ phiên bản đang tạo, rồi thấy nó (Read
Committed: câu lệnh sau khi lấy khóa thấy commit trước) và bị từ chối; ngược lại tạo phiên bản chờ đổi tháng và dùng tháng mới.
Thứ tự khóa: `holdValue` là việc đầu của transaction tạo phiên bản (trước khóa dòng đề xuất và khóa năm ngân sách); `set` không
lấy khóa nào của budgets và truy vấn `budget_versions` chỉ là SELECT thường, nên không có chu trình chờ. Các đường khác tạo phiên
bản (`VersionRevisionService`) cần phiên bản hiện có, nên luôn nằm sau khi khóa đã có hiệu lực.

**Lỗi và wire.** `409 PARAMETER.LOCKED`, message tiếng Anh không mã nội bộ, `details: { key, reason }`. Không đổi mã lỗi hiện có
(`PARAMETER.NOT_FOUND`, `PARAMETER.VALUE_INVALID`).

**Giới hạn đã biết.** Khóa chỉ có hiệu lực với writer qua ứng dụng; SQL tay trên `parameter_values` không bị chặn. Một đề xuất
ngân sách đã gửi trước lúc đổi tháng không bị tính lại (xem `## Open decisions`).

## Test matrix

| AC / rủi ro     | Tình huống (gồm từ chối, edge case)                                         | Cấp test                                                  | Kết quả mong đợi                                                            | Bằng chứng sau implement                                            |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `US-01-04` AC-8 | chưa có phiên bản: đổi 1→4→1                                                | integration PostgreSQL                                    | 200 hai lần, hai audit `PARAMETER.CHANGED`                                  | `fiscal-year-start-lock.integration-spec.ts`                        |
| `US-01-04` AC-8 | có phiên bản chỉ ở `DRAFT`: đổi 1→4                                         | integration PostgreSQL                                    | 409 `PARAMETER.LOCKED`, `details { key, reason }`                           | cùng file                                                           |
| `US-01-04` AC-8 | bị từ chối: giá trị, số dòng lịch, audit                                    | integration PostgreSQL                                    | không đổi (dòng hiện hành, số dòng `parameter_values`, số audit giữ nguyên) | cùng file                                                           |
| `US-01-04` AC-8 | phiên bản đã gửi và thành hiện hành                                         | integration PostgreSQL                                    | vẫn 409                                                                     | cùng file                                                           |
| `US-01-04` AC-3 | giá trị ngoài miền khi có phiên bản                                         | integration PostgreSQL                                    | 422 `PARAMETER.VALUE_INVALID` (kiểm miền trước khóa)                        | cùng file                                                           |
| `US-01-04` AC-8 | đặt đúng tháng hiện tại khi có phiên bản                                    | integration PostgreSQL + unit                             | 200, không dòng mới, không audit; reader không bị hỏi                       | cùng file; `parameter-lock.spec.ts`                                 |
| rủi ro phạm vi  | tham số khác khi có phiên bản                                               | integration PostgreSQL + unit                             | vẫn đổi được; reader của key khác không bị hỏi                              | cùng file; `parameter-lock.spec.ts`                                 |
| race            | tạo phiên bản đầu đang giữ khóa, đổi tháng đến sau                          | integration PostgreSQL (khóa dòng đề xuất giữ thứ tự)     | tạo 201; đổi 409; không thay giá trị/audit; còn đúng một phiên bản          | `fiscal-year-start-lock-race-creation-first`                        |
| race            | đổi tháng đang giữ khóa, tạo phiên bản đến sau                              | integration PostgreSQL (khóa dòng giá trị giữ thứ tự)     | đổi 200; tạo 201 sau commit của đổi, dưới tháng mới; đổi tiếp bị 409        | `fiscal-year-start-lock-race-change-first`                          |
| race (đột biến) | bỏ khóa chia sẻ trong tạo phiên bản / reader luôn nói "tự do"               | cùng hai file                                             | các test race / từ chối đỏ                                                  | xem plan, bảng Verification                                         |
| wiring / ánh xạ | reader đăng ký đúng key; `ParameterLockedError` → 409; thứ tự hỏi-ghi-audit | unit                                                      | theo mô tả                                                                  | `parameter-lock.spec.ts`, `fiscal-year-start-lock.listener.spec.ts` |
| kiến trúc       | điểm mở có bên đăng ký ở mọi graph dùng; export Nest; tầng; capability      | gates `extension-wiring`, `module-graph`, `module-layout` | xanh (module-graph cần một dòng của coordinator, xem plan)                  | plan                                                                |

## Open decisions

Không tự chốt thay Owner; chưa có Owner review của spec này.

1. Đề xuất ngân sách đã gửi (chưa có phiên bản) khi tháng đổi: giữ nguyên `year` đã tính, hay cũng khóa? Nguồn (`AC-8`) chỉ nêu
   "phiên bản ngân sách" nên hạng mục này không khóa đề xuất.
2. Có cần cờ `locked`/lý do trong `GET /api/v1/operating-parameters` để FE vô hiệu hóa ô nhập không? Đổi wire; để hạng mục
   riêng nếu FE cần.

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối (coordinator: `openapi.json`, `module-graph`,
      artefact sinh).
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE (thêm 409 `PARAMETER.LOCKED`).
- [x] Không tăng legacy ledger kiến trúc.
- [x] Module card (`operating-parameters`, `budgets`) cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: thiết kế và implement trên cây làm việc chưa commit (xem [plan](plan.md)). Chưa Owner review, chưa nghiệm thu.
