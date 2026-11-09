# Spec: cảnh báo chỉ định Business Owner thay thế (`US-04-06`)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-1.7`, `INV-06`, `BR-06.1`, `BR-06.7`, `QĐ-77k`; `US-04-06` AC-1→AC-6 trong `BE-UserStory/src/EP-04.md`; ERD logic `saas_products.business_owner_*`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi Business Owner của một ứng dụng chuyển _đã nghỉ việc_, ứng dụng vẫn giữ người cũ kèm cờ _cần thay thế_ (không bao giờ để trống, `INV-06`), IT Admin thấy danh sách ứng dụng cần chỉ định người thay (gồm cả phần mềm nội bộ), chỉ định được người đang làm việc, và mọi lần đổi Business Owner nằm trong lịch sử (người cũ, người mới, thời điểm, người chỉ định) và Audit Trail. Người đã nghỉ không nhận cảnh báo gia hạn; đổi phòng mà còn làm việc thì không có cảnh báo.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Business Owner của ứng dụng luôn là một người, kèm cờ khi người đó đã nghỉ; chủ là capability `catalog/catalog-entry`.
- Boundaries: bảng `application_business_owners` (lịch sử các giai đoạn Business Owner) của `catalog`; cờ và cảnh báo **suy ra khi đọc** từ trạng thái nhân viên qua `OrganizationService`; route đọc cảnh báo và lịch sử; việc chỉ định thay dùng `PATCH /applications/{id}` đã có (kiểm người thay đang làm việc, khóa nhân viên); contract `ApplicationLookupService.renewalAlertRecipient` cho bộ gửi cảnh báo gia hạn sau này; một giao dịch mỗi lệnh ghi cùng Audit Trail.
- Not larger: sự kiện nghỉ việc thật và bàn giao dữ liệu nhân sự là G6 (`US-03-04`): lát này đọc trạng thái nhân viên đã có; gửi cảnh báo qua kênh (`US-11-01`) nhận người nhận từ contract ở đây.
- Not smaller: cờ, danh sách cảnh báo, lịch sử và chỉ định cùng một aggregate (ứng dụng) và một quyền; thiếu lịch sử thì "người cũ, người mới, thời điểm" không có dữ liệu.
- Siblings: không.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC        | Coverage | Phần còn lại thuộc |
| -------- | --------- | -------- | ------------------ |
| US-04-06 | AC-1→AC-6 | full     | —                  |

## Supporting references

`FR-1.7`, `INV-06`, `BR-06.1`, `BR-06.7`, `QĐ-77k`, OI-05c, [ADR-0013](../../../decisions/0013-catalog-finance-licensing-contexts.md).

## Explicit out of scope

- Chặn nghỉ việc vì còn là Business Owner (không có trong nguồn); gửi cảnh báo qua kênh và cảnh báo gia hạn (`US-11-01`): lát này chỉ cho bộ gửi biết _ai là người nhận hợp lệ_.
- Sự kiện nghỉ việc (`US-03-04`, G6) và đổi phòng (`US-02-*`): trạng thái nhân viên là dữ liệu đã có; không cần sự kiện vì cờ suy ra khi đọc.
- Chỉ định Business Owner khi khai báo ứng dụng và đổi người còn làm việc: đã có ở `g3-catalog-entry` (`POST`/`PATCH /applications`); lát này thêm lịch sử cho cả hai.

## Dependencies and blockers

`g3-catalog-entry` (bảng `applications`, `PATCH`, `requireWorkingOwner`); `OrganizationService.getEmployees`; `AuditService`. Không blocker.

## Ownership: module, data, API

- Module `catalog`: capability `catalog-entry/` thêm `application-owner.service.ts` (cảnh báo, lịch sử), `application-owners.controller.ts`, mở rộng `application.repo.ts` (ghi và đọc lịch sử cùng bảng `applications`), `application.service.ts` (ghi lịch sử trong giao dịch khai báo và đổi người), `application-lookup.service.ts` (`renewalAlertRecipient`).
- Dữ liệu: bảng `application_business_owners` (model `ApplicationBusinessOwner`; `PRISMA_MODEL_OWNER` → `catalog`); migration chép Business Owner hiện tại của mọi ứng dụng đã có thành giai đoạn đầu.
- API (`IT_ADMIN`; `FINANCE` đọc lịch sử): `GET /business-owner-warnings`, `GET /applications/{id}/business-owners` — hai operation; chỉ định thay là `PATCH /applications/{id}` (đã có).

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn              | Kết luận                                                                                                                                                                                                                                                                                                                      | Nguồn / loại            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Cờ _cần thay thế_ lưu hay suy ra | **Suy ra khi đọc**: `businessOwnerReplacementRequired = (trạng thái nhân viên của Business Owner là TERMINATED)`; không cột, không sự kiện nhân sự, nên không lệch dữ liệu và không cần chờ G6. Khác ERD (cột `business_owner_replacement_required`): Owner xác nhận khi review                                               | AC-1, AC-2; `FR-1.7`    |
| Ứng dụng không bao giờ trống     | Người cũ được giữ tới khi có người thay đang làm việc: nghỉ việc không đổi cột Business Owner; `GET /applications/{id}` trả người cũ cùng cờ (và `businessOwner.status = TERMINATED`)                                                                                                                                         | AC-2; `INV-06`          |
| Cảnh báo cần chỉ định            | `GET /business-owner-warnings` liệt kê mọi ứng dụng (mọi loại, kể cả nội bộ — mọi ứng dụng như nhau, AC-4) mà Business Owner đã nghỉ việc: ứng dụng, loại, người cũ; theo tên ứng dụng, phân trang. Hết cảnh báo khi Business Owner mới đang làm việc — suy ra nên không gửi lặp                                              | AC-1, AC-3, AC-4        |
| Chỉ định người thay              | `PATCH /applications/{id}` với `businessOwnerEmployeeId` (đã có): người thay phải **đang làm việc** (khóa `FOR SHARE`), người đã nghỉ hoặc không có ⟹ 422 `APPLICATION.BUSINESS_OWNER_INVALID` và Business Owner **không đổi**, cờ giữ nguyên; thành công ⟹ cờ hết, lịch sử đóng giai đoạn cũ và mở giai đoạn mới, audit      | AC-3, AC-5; `INV-06`    |
| Đổi phòng không phải nghỉ việc   | Cờ chỉ đọc _trạng thái nhân viên_; điều chuyển phòng không đổi trạng thái nên không cờ, không cảnh báo, Business Owner giữ nguyên                                                                                                                                                                                             | AC-6; `FR-1.7`          |
| Người nhận cảnh báo gia hạn      | `ApplicationLookupService.renewalAlertRecipient(applicationId)` trả mã nhân viên của Business Owner **chỉ khi còn làm việc**, ngược lại `null` (người đã nghỉ không nhận cảnh báo gia hạn); bộ gửi cảnh báo (`US-11-01`) dùng đúng contract này, không tự đọc nhân viên                                                       | AC-2; `BR-06.7`, OI-05c |
| Lịch sử Business Owner           | `application_business_owners`: mỗi giai đoạn gồm nhân viên, thời điểm bắt đầu, người chỉ định (giá trị, không khóa ngoại — như audit), thời điểm kết thúc; một giai đoạn mở mỗi ứng dụng (chỉ mục duy nhất một phần); giai đoạn đóng không bao giờ sửa. `GET /applications/{id}/business-owners` trả giai đoạn mới nhất trước | Story "Dữ liệu"         |
| Quyền                            | Cảnh báo và chỉ định: `IT_ADMIN`; Finance đọc lịch sử; Finance (chỉ định), trưởng phòng, Employee, Super Admin bị 403. Business Owner là thuộc tính, không cấp/thu hồi quyền (`SoD-5`)                                                                                                                                        | `SoD-5`                 |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-B1 | `replacementRequired(status)` thuần trong `application.policy.ts` (chỉ `TERMINATED` ⟹ true); `ApplicationService.withOwners` đặt cờ vào mọi view ứng dụng; không cột nào lưu cờ                                                                                                                         |
| T-B2 | Cảnh báo: lấy mã nhân viên khác nhau của mọi ứng dụng, đọc trạng thái qua `OrganizationService.getEmployees`, lọc `TERMINATED`, rồi đọc trang ứng dụng của họ (cùng snapshot `RepeatableRead`, theo tên chuẩn hóa); catalog không đọc bảng nhân viên                                                    |
| T-B3 | Lịch sử ghi trong chính giao dịch khai báo và đổi Business Owner: khai báo mở giai đoạn đầu; đổi người đóng giai đoạn mở (`ended_at`) rồi mở giai đoạn mới. CHECK `ended_at ≥ assigned_at`; chỉ mục duy nhất một phần `(application_id) WHERE ended_at IS NULL`; trigger chặn sửa/xóa giai đoạn đã đóng |
| T-B4 | Migration chép Business Owner hiện tại của mọi ứng dụng đã khai thành giai đoạn đầu (`assigned_at = created_at`, người chỉ định rỗng — chỉ dùng cho dữ liệu có trước lát này; mọi giai đoạn mới có người chỉ định)                                                                                      |

### HTTP contract

Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503
`SERVICE_UNAVAILABLE`/`TOKEN_VERIFICATION_UNAVAILABLE`. Mọi `Application` trên dây thêm `businessOwnerReplacementRequired: boolean`.

| Operation (operationId)                                                          | Thành công                                                                                                                                                                         | Lỗi riêng                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `GET /business-owner-warnings` (`businessOwnerWarningList`) — `page`, `pageSize` | 200 `BUSINESS_OWNER_WARNING.LISTED` `{ items: [{ applicationId, applicationName, kind, businessOwner: { employeeId, employeeCode, fullName, status } }], pagination }`             | —                           |
| `GET /applications/{id}/business-owners` (`applicationBusinessOwnerHistory`)     | 200 `APPLICATION.BUSINESS_OWNERS_LISTED` `{ items: [{ employee: { employeeId, employeeCode, fullName, status }, assignedAt, assignedBy\|null, endedAt\|null }] }` — mới nhất trước | 404 `APPLICATION.NOT_FOUND` |

Chỉ định thay: `PATCH /applications/{id}` `{ businessOwnerEmployeeId }` (đã có, `g3-catalog-entry`). Không có `DELETE`.

### Dữ liệu và migration

Migration `20261020170000_catalog_application_business_owners`: bảng `application_business_owners`, CHECK, chỉ mục duy nhất một phần, khóa ngoại tới `applications` và `employees`, trigger bất biến cho giai đoạn đã đóng, chép giai đoạn đầu của dữ liệu có trước. Không đổi bảng hiện có. Rollback: không code cũ nào dùng bảng; gỡ bằng migration mới.

### Audit và bảo mật

Audit cùng giao dịch: `APPLICATION.UPDATED` (đã có: Business Owner trước/sau); lịch sử là dữ liệu, không thay audit. Cảnh báo là tín hiệu quản trị, không phải kết luận về cá nhân. Không dữ liệu cá nhân ngoài tham chiếu nhân viên (tên và mã đọc qua facade).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                    | Cấp test                  | Bằng chứng sau implement                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| AC-1        | `B1` là Business Owner của Figma và Jira, chuyển _đã nghỉ việc_ ⟹ `GET /business-owner-warnings` liệt kê hai ứng dụng; ứng dụng của người còn làm việc không có                                                        | policy + integration      | policy + `application-owners-http` (đồng thời Figma và Jira)                                      |
| AC-2        | Chưa xử lý: `GET /applications/{id}` vẫn `B1`, `businessOwnerReplacementRequired true`, `status TERMINATED`; `renewalAlertRecipient` ⟹ `null` (người đã nghỉ không nhận cảnh báo gia hạn); còn làm việc ⟹ mã nhân viên | policy + integration      | policy + `application-owners-http` (cờ, `renewalAlertRecipient` ⟹ null cho người đã nghỉ)         |
| AC-3        | `PATCH` chọn `B2` đang làm việc ⟹ Business Owner `B2`, cờ hết, ứng dụng ra khỏi cảnh báo; lịch sử có hai giai đoạn (cũ đã đóng, mới đang mở, người chỉ định = IT Admin); audit trước/sau                               | integration               | `application-owners-http` (đóng giai đoạn cũ, audit trước/sau; đột biến bỏ đóng giai đoạn làm đỏ) |
| AC-4        | _Cổng báo cáo nội bộ_ (loại nội bộ) có `B4` nghỉ việc ⟹ cùng cảnh báo như ứng dụng khác                                                                                                                                | integration               | `application-owners-http` (phần mềm nội bộ)                                                       |
| AC-5        | `PATCH` chọn `B3` đã nghỉ (hoặc không tồn tại) ⟹ 422 `APPLICATION.BUSINESS_OWNER_INVALID`, Business Owner vẫn `B1` kèm cờ, lịch sử không đổi                                                                           | integration               | `application-owners-http` (người nghỉ và người không tồn tại; lịch sử không đổi)                  |
| AC-6        | `B1` còn làm việc (đổi phòng không đổi trạng thái) ⟹ cờ `false`, không cảnh báo, vẫn Business Owner; `replacementRequired` chỉ phụ thuộc trạng thái                                                                    | policy + integration      | policy + `application-owners-http`                                                                |
| Lịch sử     | Khai báo mở giai đoạn đầu; sửa tên ứng dụng không mở giai đoạn; chọn lại đúng người hiện tại không mở giai đoạn; một giai đoạn mở mỗi ứng dụng; giai đoạn đóng không sửa/xóa được; dữ liệu có trước được chép          | integration + constraints | `application-owners-http` + `application-owners-constraints` (RED 5/5 trước migration)            |
| Quyền       | Finance, trưởng phòng, Employee, Super Admin gọi cảnh báo ⟹ 403; Finance đọc lịch sử được, Employee ⟹ 403; chỉ định bởi Finance ⟹ 403 (đã có ở `g3-catalog-entry`)                                                     | e2e + integration         | e2e + `application-owners-http`                                                                   |
| Hợp đồng    | `api-inventory`: hai operation mới có summary ngắn, 401/403/422/503, message riêng; manifest cập nhật; không `DELETE`                                                                                                  | e2e                       | e2e `api-inventory` 100 operation                                                                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp (AC-1→AC-6).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi nên e2e + `pnpm openapi:export`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract mới đã báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER` thêm `ApplicationBusinessOwner`.
- [x] ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: cờ _cần thay thế_ suy ra khi đọc thay cho cột của ERD; lịch sử Business Owner là bảng giai đoạn riêng, chép từ dữ liệu có trước; cảnh báo liệt kê mọi ứng dụng như nhau; `FINANCE` đọc lịch sử; bộ gửi cảnh báo gia hạn phải lấy người nhận qua `renewalAlertRecipient`. Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.
