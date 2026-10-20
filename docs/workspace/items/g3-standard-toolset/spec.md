# Spec: bộ công cụ chuẩn theo phòng × chức vụ (`US-04-10` phần cấu hình)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-3.18`, `QĐ-52e`, `QĐ-58b`, `QĐ-58c`, `QĐ-62p`, `QĐ-68d`, `QĐ-70b`; `US-04-10` AC-1→AC-12 trong `BE-UserStory/epics/EP-04.md`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin đặt danh sách công cụ chuẩn (các gói của danh mục) cho từng cặp phòng × chức vụ, **bắt buộc kèm lý do**; mỗi lần đổi là một phiên bản có người đổi, lý do và thời điểm, Audit Trail ghi danh sách trước/sau. Trưởng phòng đọc bộ chuẩn của phòng mình, nhân viên đọc bộ chuẩn của chính họ. Đổi bộ chuẩn **không** cấp hay thu hồi quyền của ai và không có gợi ý bằng AI hay usage.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: capability `catalog/standard-toolset`: bộ chuẩn là cấu hình danh mục do IT Admin giữ.
- Boundaries: bảng `standard_toolsets` (đầu phiên bản của một cặp), `standard_toolset_versions`, `standard_toolset_items` của `catalog`, khóa ngoại tới `departments`, `job_titles` (organization) và `plans`; route `/standard-toolsets*`; mục gợi ý sau bước 3 trong checklist khởi tạo.
- Not larger: thông báo cho trưởng phòng (AC-1, AC-3 vế thông báo — `g4-notification-delivery`); phân loại yêu cầu _ngoài bộ chuẩn_, hiện bộ chuẩn trong form yêu cầu và không mở rà soát khi đổi chức vụ (AC-5, AC-6, AC-11 — `g4-request-and-transfer-integration`).
- Not smaller: cấu hình, lý do, phiên bản, quyền đọc và kiểm chức vụ ngừng dùng chung một aggregate.
- Siblings: `g4-notification-delivery`, `g4-request-and-transfer-integration`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC                           | Coverage | Phần còn lại thuộc                                                                                            |
| -------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| US-04-10 | AC-1→AC-4, AC-7→AC-10, AC-12 | partial  | AC-1, AC-3 vế thông báo: `g4-notification-delivery`; AC-5, AC-6, AC-11: `g4-request-and-transfer-integration` |

AC-1 và AC-3 `partial`: lát này làm vế _lưu, Audit Trail ghi người, lý do, trước/sau_; vế _trưởng phòng nhận thông báo_ cần hộp thông báo (G5/G8). Mục cấu hình bộ chuẩn hiện sau bước 3 trong checklist khởi tạo (`US-02-04` AC-5, Story của G2) được làm cùng lát này và ghi ở `g2-onboarding-checklist`; AC-5 không nằm trong bảng trên vì Story đó thuộc nhóm G2.

## Supporting references

`FR-3.18`, `QĐ-52e`, `QĐ-58b`, `QĐ-58c`, `QĐ-62c`, `QĐ-62p`, `QĐ-68d`, `QĐ-70b`, `QĐ-49e`, `OQ-B-08`, `OQ-B-09`, `OQ-A-27`.

## Explicit out of scope

Thông báo; phân loại _ngoài bộ chuẩn_ của yêu cầu; hiện bộ chuẩn khi tạo yêu cầu; rà soát khi đổi chức vụ; gợi ý bằng AI hoặc usage (không làm, `QĐ-49e`).

## Dependencies and blockers

`g3-plan-declaration` (gói), `g2-department-profile` (phòng), `g2-job-title-catalogue-and-manual-employee` (chức vụ, trạng thái ngừng dùng), `g4-seat-baseline-import` (kiểm không tạo Assignment); `AuditService`. Không blocker.

## Ownership: module, data, API

- Module `catalog`: capability `standard-toolset/` (`standard-toolset.policy.ts` + spec, `standard-toolset.repo.ts`, `standard-toolset.service.ts`, `standard-toolsets.controller.ts`, `standard-toolset.dto.ts`, `standard-toolset.errors.ts`, `standard-toolset.http-errors.ts`); `CatalogService.getOnboardingFacts` thêm `standardToolsets`.
- Module `organization`: `OrganizationService.getDepartmentBrief`, `lockDepartmentShared`, `getEmployeePlacement` (phòng và chức vụ hiện tại của một nhân viên, theo id).
- Module `onboarding`: checklist thêm `suggestions` (mục bộ chuẩn sau bước 3).
- Dữ liệu: `standard_toolsets`, `standard_toolset_versions`, `standard_toolset_items`; `PRISMA_MODEL_OWNER`: ba model → `catalog`.
- API (năm operation): `GET /standard-toolsets` (`IT_ADMIN`; `MANAGER` chỉ phòng mình), `GET /standard-toolsets/mine` (mọi người đăng nhập), `GET /standard-toolsets/{departmentId}/{jobTitleId}` (`IT_ADMIN`; `MANAGER` phòng mình), `PUT /standard-toolsets/{departmentId}/{jobTitleId}` (chỉ `IT_ADMIN`), `GET /standard-toolsets/{departmentId}/{jobTitleId}/history` (`IT_ADMIN`).

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn           | Kết luận                                                                                                                                                                                                                                                                                                                                                                                                                                        | Nguồn / loại              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Mục của bộ chuẩn              | Mỗi mục là một **gói** của danh mục (`planId`), như _Figma Organization_, _Miro Team_; tối đa 50 mục, không trùng; danh sách rỗng hợp lệ (bỏ hết). Gói không có trong danh mục ⟹ `422 STANDARD_TOOLSET.PLAN_NOT_FOUND` kèm các id; không có đường thêm công cụ ngoài danh mục                                                                                                                                                                   | AC-9                      |
| Lý do                         | Bắt buộc ở mọi lần lưu (1–1000 ký tự sau khi cắt khoảng trắng); thiếu ⟹ `422 STANDARD_TOOLSET.REASON_REQUIRED`, bộ chuẩn không đổi, không audit. `PUT` giống hệt bộ hiện tại (cùng tập gói) ⟹ 200 `changed = false`, không phiên bản, không audit                                                                                                                                                                                               | AC-2                      |
| Phiên bản và audit            | Mỗi lần đổi là một phiên bản **bất biến** (số tăng 1, người đổi, lý do, thời điểm, các gói); phiên bản cũ không bao giờ sửa hay xóa (CSDL chặn); audit `STANDARD_TOOLSET.CHANGED` cùng giao dịch với trước/sau (`version`, `planIds`, lý do); vai người đổi ghi trong audit nên IT Admin khác phụ trách vẫn được phép (`QĐ-58b`)                                                                                                                | AC-1, AC-3, AC-8          |
| Cặp mới và chức vụ ngừng dùng | Cặp (phòng, chức vụ) chưa có bộ chuẩn là cặp **mới**: chức vụ phải còn dùng ⟹ ngừng dùng thì `422 STANDARD_TOOLSET.JOB_TITLE_INACTIVE`; phòng phải còn hoạt động ⟹ `422 STANDARD_TOOLSET.DEPARTMENT_INACTIVE`. Cặp đã có thì cập nhật được dù chức vụ ngừng dùng (`QĐ-68d`, `QĐ-70b`); phòng hay chức vụ không tồn tại ⟹ 404                                                                                                                    | AC-12                     |
| Không cấp, không thu hồi      | Đổi bộ chuẩn chỉ ghi ba bảng trên: không Assignment, không tác vụ cấp hay thu hồi nào được tạo hay đổi                                                                                                                                                                                                                                                                                                                                          | AC-4                      |
| Không gợi ý                   | Không route nào đề xuất hay thêm công cụ từ AI hoặc usage; danh sách để chọn là danh sách gói của danh mục (`GET /plans`). Kiểm bằng 404 của route gợi ý                                                                                                                                                                                                                                                                                        | AC-7; `QĐ-49e`            |
| Phòng thiếu trưởng phòng      | Vẫn lưu và audit; lát này không gửi thông báo nên không có thông báo nào bị giao cho người khác (`QĐ-62c`)                                                                                                                                                                                                                                                                                                                                      | AC-10                     |
| Quyền                         | Ghi: chỉ `IT_ADMIN` (Finance, trưởng phòng, Employee, Người duyệt chi, Super Admin ⟹ 403). Đọc theo cặp và danh sách: `IT_ADMIN` mọi phòng, trưởng phòng chỉ phòng mình (`403 DEPARTMENT.OUT_OF_SCOPE`). `GET /standard-toolsets/mine`: bất kỳ ai đăng nhập, trả bộ chuẩn của phòng và chức vụ **hôm nay** của họ (`toolset: null` khi cặp chưa có bộ chuẩn; cả `department`, `jobTitle` và `toolset` là `null` khi họ chưa có chỗ làm hôm nay) | AC-8; Story               |
| Mục gợi ý trong checklist     | `GET /onboarding-checklist` thêm `suggestions: [{ key: 'STANDARD_TOOLSET', afterStep: 3, story: 'US-04-10', available, configuredPairs, blocksStep: false }]`; `available` khi bước 3 hoàn tất; chưa cấu hình bộ chuẩn **không** chặn bước nào                                                                                                                                                                                                  | `US-02-04` AC-5, `QĐ-66d` |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-S1 | `cleanToolsetInput({ planIds, reason })` thuần: cắt và kiểm lý do, bắt trùng, ≤ 50 mục, trả tập đã sắp theo id; `sameToolset(a, b)` so tập                                                                                                                                                                               |
| T-S2 | Phiên bản bất biến: trigger `BEFORE UPDATE OR DELETE` trên `standard_toolset_versions` và `standard_toolset_items` (`55000`); đầu `standard_toolsets(department_id, job_title_id, current_version)` là hàng duy nhất được sửa, khóa `FOR UPDATE` mỗi lần đổi nên hai lần đổi đồng thời xếp hàng và số phiên bản liên tục |
| T-S3 | Mỗi lần đổi một `TransactionRunner.run`: khóa phòng và chức vụ `FOR SHARE`, kiểm phòng và chức vụ của cặp mới, chèn đầu `ON CONFLICT DO NOTHING`, khóa đầu, so với bản hiện tại, kiểm các gói tồn tại và khóa `FOR SHARE`, chèn phiên bản và mục, tăng `current_version`, audit                                          |
| T-S4 | `catalog` đọc `organization` qua facade (phòng, chức vụ, vị trí hiện tại của nhân viên, phòng của trưởng phòng); không có Assignment hay thông báo trong capability này                                                                                                                                                  |

### HTTP contract

Lỗi chung: 401, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503. Trên dây: `Toolset = { departmentId, jobTitleId, version, plans: [{ planId, planName, applicationId, applicationName }], reason, changedBy, changedAt }`.

| Operation (operationId)                                                                                      | Thành công                                                                             | Lỗi riêng                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /standard-toolsets` (`standardToolsetList`) — `departmentId?`, `page`, `pageSize`                       | 200 `STANDARD_TOOLSET.LISTED` — các cặp đã có bộ chuẩn, mỗi cặp với phiên bản hiện tại | 403 `DEPARTMENT.OUT_OF_SCOPE` (trưởng phòng hỏi phòng khác hoặc không chỉ định phòng của mình)                                                                                   |
| `GET /standard-toolsets/mine` (`standardToolsetMine`)                                                        | 200 `STANDARD_TOOLSET.FETCHED` `{ department, jobTitle, toolset }`                     | — (không có chỗ làm hôm nay ⟹ `department`, `jobTitle`, `toolset` đều `null`)                                                                                                    |
| `GET /standard-toolsets/{departmentId}/{jobTitleId}` (`standardToolsetGet`)                                  | 200 `STANDARD_TOOLSET.FETCHED` `{ toolset                                              | null }`— cặp chưa có ⟹`null`, không 404                                                                                                                                          | 404 `DEPARTMENT.NOT_FOUND`, `JOB_TITLE.NOT_FOUND`; 403 `DEPARTMENT.OUT_OF_SCOPE` |
| `PUT /standard-toolsets/{departmentId}/{jobTitleId}` (`standardToolsetSet`) — `{ planIds, reason }`          | 200 `STANDARD_TOOLSET.SET` `{ toolset, changed }`                                      | 404 phòng/chức vụ; 422 `STANDARD_TOOLSET.REASON_REQUIRED`, `PLAN_NOT_FOUND` (`details.planIds`), `PLAN_DUPLICATE`, `TOO_MANY_PLANS`, `JOB_TITLE_INACTIVE`, `DEPARTMENT_INACTIVE` |
| `GET /standard-toolsets/{departmentId}/{jobTitleId}/history` (`standardToolsetHistory`) — `page`, `pageSize` | 200 `STANDARD_TOOLSET.HISTORY_LISTED` — phiên bản mới nhất trước                       | 404 phòng/chức vụ                                                                                                                                                                |

Không có `DELETE`, không có route gợi ý.

### Dữ liệu và migration

Migration `20261020210000_catalog_standard_toolsets`: ba bảng (CHECK `version >= 1`, `current_version >= 0`, lý do không rỗng; unique `(department_id, job_title_id, version)`), khóa ngoại `RESTRICT` tới `departments`, `job_titles`, `plans`, `organizations`; trigger bất biến T-S2. Không đụng bảng hiện có.

### Audit và bảo mật

`STANDARD_TOOLSET.CHANGED` (tài nguyên `StandardToolset`, id `departmentId/jobTitleId`; trước/sau: phiên bản, gói, lý do; tác nhân `USER` kèm vai). Không dữ liệu cá nhân.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                            | Cấp test                  | Kết quả mong đợi                              | Bằng chứng sau implement |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------- | ------------------------ |
| US-04-10 AC-1             | IT Admin đặt (`P-DES`, Designer) = Figma Organization + Miro Team, lý do "theo đề xuất của trưởng phòng" ⟹ phiên bản 1; audit ghi người, lý do, trước (`null`) / sau; trưởng phòng đọc được                                    | policy + integration HTTP | lưu được, audit đủ (thông báo thuộc lát khác) | chờ chạy                 |
| US-04-10 AC-2             | Lưu không lý do, lý do toàn khoảng trắng ⟹ 422, bộ chuẩn và phiên bản không đổi, không audit                                                                                                                                   | policy + integration      | bị từ chối                                    | chờ chạy                 |
| US-04-10 AC-3             | Thay Sketch bằng Figma với lý do ⟹ phiên bản 2, phiên bản 1 nguyên vẹn, audit trước/sau; cùng tập ⟹ `changed = false`                                                                                                          | integration               | lịch sử bất biến                              | chờ chạy                 |
| US-04-10 AC-4             | Thêm Figma, bỏ Sketch ⟹ không Assignment mới, Assignment cũ nguyên, không tác vụ (đếm bảng không đổi)                                                                                                                          | integration               | không tự cấp, không tự thu hồi                | chờ chạy                 |
| US-04-10 AC-7             | Không route gợi ý (404); danh sách chọn chỉ là gói của danh mục                                                                                                                                                                | e2e                       | không AI/usage                                | chờ chạy                 |
| US-04-10 AC-8             | Finance, trưởng phòng, Employee, Người duyệt chi, Super Admin `PUT` ⟹ 403; IT Admin không phụ trách phòng đó `PUT` ⟹ 200 và audit ghi đúng người                                                                               | e2e + integration         | chỉ IT Admin, có dấu vết                      | chờ chạy                 |
| US-04-10 AC-9             | Gói không tồn tại ⟹ 422 `PLAN_NOT_FOUND`; trùng gói ⟹ 422; quá 50 gói ⟹ 422                                                                                                                                                    | policy + integration      | chỉ mục của danh mục                          | chờ chạy                 |
| US-04-10 AC-10            | Phòng chưa có trưởng phòng ⟹ vẫn lưu và audit                                                                                                                                                                                  | integration               | lưu được                                      | chờ chạy                 |
| US-04-10 AC-12            | Cặp mới với chức vụ ngừng dùng ⟹ 422 `JOB_TITLE_INACTIVE`, không tạo gì; cặp đã có của chức vụ đã ngừng ⟹ cập nhật được; phòng ngừng hoạt động ⟹ cặp mới 422                                                                   | integration               | `QĐ-68d`, `QĐ-70b`                            | chờ chạy                 |
| Checklist (US-02-04 AC-5) | Sau bước 3 checklist có mục bộ chuẩn (`afterStep 3`, `blocksStep false`); trước bước 3 `available = false`; chưa cấu hình vẫn mở được bước 4                                                                                   | unit + integration        | mục gợi ý không chặn                          | chờ chạy                 |
| Đọc                       | Trưởng phòng đọc phòng mình ⟹ 200, phòng khác ⟹ 403 `OUT_OF_SCOPE`; nhân viên `GET mine` ⟹ bộ chuẩn của phòng × chức vụ hôm nay hoặc `null`; cặp chưa có ⟹ `toolset: null`; phòng/chức vụ không có ⟹ 404; danh sách phân trang | integration               | đúng phạm vi                                  | chờ chạy                 |
| Đồng thời                 | Hai `PUT` khác nhau cùng lúc ⟹ phiên bản 1 và 2; hai `PUT` giống nhau ⟹ một phiên bản; CSDL chặn sửa/xóa phiên bản và mục                                                                                                      | integration + constraints | số phiên bản liên tục, lịch sử bất biến       | chờ chạy                 |
| Hợp đồng                  | `api-inventory`: năm operation mới có summary, 401/403/404/422/503, message riêng; manifest cập nhật                                                                                                                           | e2e                       | 121 operation                                 | chờ chạy                 |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER` thêm đúng ba model.
- [ ] ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: mục của bộ chuẩn là gói (không phải ứng dụng); mỗi lần lưu cần lý do kể cả khi chỉ bỏ hết mục; trưởng phòng đọc được cả danh sách cặp của phòng mình; cặp mới yêu cầu phòng còn hoạt động; chưa có thông báo (AC-1, AC-3), phân loại yêu cầu (AC-5, AC-11) và rà soát đổi chức vụ (AC-6). Chưa code, chưa review, chưa nghiệm thu.
